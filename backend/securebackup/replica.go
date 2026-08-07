package securebackup

import (
	"context"
	"crypto/sha256"
	"errors"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"syscall"
)

const replicaSentinelName = ".our-memories-replica"

type replicaTargetState struct {
	Connected          bool
	IndependentStorage bool
}

func (s *Service) copyToReplica(
	ctx context.Context,
	sourcePath string,
	backup BackupInfo,
) (ReplicaInfo, int, replicaTargetState, error) {
	fileName := backup.FileName
	state, err := s.inspectReplicaTarget()
	if err != nil {
		return ReplicaInfo{}, 0, state, err
	}
	if err := ctx.Err(); err != nil {
		return ReplicaInfo{}, 0, state, err
	}

	source, err := os.Open(sourcePath)
	if err != nil {
		return ReplicaInfo{}, 0, state, fmt.Errorf("open local backup for replica: %w", err)
	}
	defer source.Close()
	sourceInfo, err := source.Stat()
	if err != nil {
		return ReplicaInfo{}, 0, state, fmt.Errorf("stat local backup for replica: %w", err)
	}
	if !sourceInfo.Mode().IsRegular() {
		return ReplicaInfo{}, 0, state, fmt.Errorf("local backup for replica is not a regular file")
	}

	finalPath := filepath.Join(s.config.ReplicaDirectory, fileName)
	if _, err := os.Lstat(finalPath); err == nil {
		return ReplicaInfo{}, 0, state, fmt.Errorf("replica destination already exists")
	} else if !errors.Is(err, os.ErrNotExist) {
		return ReplicaInfo{}, 0, state, fmt.Errorf("inspect replica destination: %w", err)
	}

	temporary, err := os.CreateTemp(s.config.ReplicaDirectory, "."+fileName+"-*.partial")
	if err != nil {
		return ReplicaInfo{}, 0, state, fmt.Errorf("create replica partial file: %w", err)
	}
	temporaryPath := temporary.Name()
	removeTemporary := true
	defer func() {
		_ = temporary.Close()
		if removeTemporary {
			_ = os.Remove(temporaryPath)
		}
	}()
	if err := temporary.Chmod(0600); err != nil {
		return ReplicaInfo{}, 0, state, fmt.Errorf("secure replica partial file: %w", err)
	}

	sourceHash := sha256.New()
	written, err := copyWithContext(ctx, io.MultiWriter(temporary, sourceHash), source)
	if err != nil {
		return ReplicaInfo{}, 0, state, fmt.Errorf("copy encrypted backup to replica: %w", err)
	}
	if written != sourceInfo.Size() {
		return ReplicaInfo{}, 0, state, fmt.Errorf(
			"replica size mismatch during copy: wrote %d of %d bytes",
			written,
			sourceInfo.Size(),
		)
	}
	if err := temporary.Sync(); err != nil {
		return ReplicaInfo{}, 0, state, fmt.Errorf("sync replica partial file: %w", err)
	}
	if err := temporary.Close(); err != nil {
		return ReplicaInfo{}, 0, state, fmt.Errorf("close replica partial file: %w", err)
	}

	replicaHash, replicaSize, err := hashFile(temporaryPath)
	if err != nil {
		return ReplicaInfo{}, 0, state, fmt.Errorf("verify replica partial file: %w", err)
	}
	if replicaSize != written || !equalDigest(sourceHash.Sum(nil), replicaHash[:]) {
		return ReplicaInfo{}, 0, state, fmt.Errorf("replica verification mismatch")
	}
	if err := os.Rename(temporaryPath, finalPath); err != nil {
		return ReplicaInfo{}, 0, state, fmt.Errorf("publish replica file: %w", err)
	}
	removeTemporary = false
	if err := syncDirectory(s.config.ReplicaDirectory); err != nil {
		return ReplicaInfo{}, 0, state, fmt.Errorf("sync replica directory: %w", err)
	}

	now := s.now().UTC()
	replica := ReplicaInfo{
		CreatedAt:  backup.CreatedAt,
		VerifiedAt: now,
		FileName:   fileName,
		Size:       replicaSize,
	}
	removed, retentionErr := enforceRetentionInDirectory(
		s.config.ReplicaDirectory,
		s.config.ReplicaRetentionCount,
		fileName,
	)
	if retentionErr != nil {
		return replica, removed, state, fmt.Errorf("enforce replica retention: %w", retentionErr)
	}
	return replica, removed, state, nil
}

func (s *Service) inspectReplicaTarget() (replicaTargetState, error) {
	state := replicaTargetState{}
	info, err := os.Stat(s.config.ReplicaDirectory)
	if err != nil {
		return state, fmt.Errorf("inspect replica directory: %w", err)
	}
	if !info.IsDir() {
		return state, fmt.Errorf("replica path is not a directory")
	}
	markerPath := filepath.Join(s.config.ReplicaDirectory, replicaSentinelName)
	marker, err := os.Lstat(markerPath)
	if err != nil {
		return state, fmt.Errorf("inspect replica sentinel: %w", err)
	}
	if !marker.Mode().IsRegular() || marker.Mode()&os.ModeSymlink != 0 {
		return state, fmt.Errorf("replica sentinel is not a regular file")
	}

	state.Connected = true
	independent, err := directoriesUseDifferentDevices(s.config.BackupDirectory, s.config.ReplicaDirectory)
	if err != nil {
		return state, fmt.Errorf("compare backup filesystems: %w", err)
	}
	state.IndependentStorage = independent
	return state, nil
}

func directoriesUseDifferentDevices(first string, second string) (bool, error) {
	firstInfo, err := os.Stat(first)
	if err != nil {
		return false, err
	}
	secondInfo, err := os.Stat(second)
	if err != nil {
		return false, err
	}
	firstStat, firstOK := firstInfo.Sys().(*syscall.Stat_t)
	secondStat, secondOK := secondInfo.Sys().(*syscall.Stat_t)
	if !firstOK || !secondOK {
		return false, fmt.Errorf("filesystem device identifiers unavailable")
	}
	return firstStat.Dev != secondStat.Dev, nil
}

func copyWithContext(ctx context.Context, destination io.Writer, source io.Reader) (int64, error) {
	buffer := make([]byte, 128*1024)
	var written int64
	for {
		if err := ctx.Err(); err != nil {
			return written, err
		}
		read, readErr := source.Read(buffer)
		if read > 0 {
			count, writeErr := destination.Write(buffer[:read])
			written += int64(count)
			if writeErr != nil {
				return written, writeErr
			}
			if count != read {
				return written, io.ErrShortWrite
			}
		}
		if errors.Is(readErr, io.EOF) {
			return written, nil
		}
		if readErr != nil {
			return written, readErr
		}
	}
}

func hashFile(filePath string) ([sha256.Size]byte, int64, error) {
	var digest [sha256.Size]byte
	file, err := os.Open(filePath)
	if err != nil {
		return digest, 0, err
	}
	defer file.Close()
	hash := sha256.New()
	size, err := io.Copy(hash, file)
	if err != nil {
		return digest, size, err
	}
	copy(digest[:], hash.Sum(nil))
	return digest, size, nil
}

func equalDigest(first []byte, second []byte) bool {
	if len(first) != len(second) {
		return false
	}
	var difference byte
	for index := range first {
		difference |= first[index] ^ second[index]
	}
	return difference == 0
}

func cloneReplicaInfo(value *ReplicaInfo) *ReplicaInfo {
	if value == nil {
		return nil
	}
	copy := *value
	return &copy
}
