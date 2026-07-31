package main

import (
	"encoding/json"
	"errors"
	"flag"
	"fmt"
	"log"
	"os"

	"our-memories-backend/securebackup"
)

func main() {
	log.SetFlags(0)
	if len(os.Args) < 2 {
		usage()
		os.Exit(2)
	}

	switch os.Args[1] {
	case "verify":
		if err := verify(os.Args[2:]); err != nil {
			log.Fatal(err)
		}
	case "extract":
		if err := extract(os.Args[2:]); err != nil {
			log.Fatal(err)
		}
	default:
		usage()
		os.Exit(2)
	}
}

func verify(arguments []string) error {
	flags := flag.NewFlagSet("verify", flag.ContinueOnError)
	flags.SetOutput(os.Stderr)
	filePath := flags.String("file", "", "encrypted backup file")
	keyEnv := flags.String("key-env", "FULL_BACKUP_ENCRYPTION_KEY", "environment variable containing the 32-byte Base64/hex key")
	if err := flags.Parse(arguments); err != nil {
		return err
	}
	key, err := keyFromEnvironment(*keyEnv)
	if err != nil {
		return err
	}
	if *filePath == "" {
		return errors.New("-file is required")
	}
	file, err := os.Open(*filePath)
	if err != nil {
		return err
	}
	defer file.Close()
	manifest, err := securebackup.VerifyEncryptedArchive(file, key)
	if err != nil {
		return fmt.Errorf("verification failed: %w", err)
	}
	encoded, err := json.MarshalIndent(manifest, "", "  ")
	if err != nil {
		return err
	}
	fmt.Println(string(encoded))
	return nil
}

func extract(arguments []string) error {
	flags := flag.NewFlagSet("extract", flag.ContinueOnError)
	flags.SetOutput(os.Stderr)
	filePath := flags.String("file", "", "encrypted backup file")
	destination := flags.String("out", "", "empty extraction directory")
	keyEnv := flags.String("key-env", "FULL_BACKUP_ENCRYPTION_KEY", "environment variable containing the 32-byte Base64/hex key")
	if err := flags.Parse(arguments); err != nil {
		return err
	}
	if *filePath == "" || *destination == "" {
		return errors.New("-file and -out are required")
	}
	key, err := keyFromEnvironment(*keyEnv)
	if err != nil {
		return err
	}
	file, err := os.Open(*filePath)
	if err != nil {
		return err
	}
	if _, err := securebackup.VerifyEncryptedArchive(file, key); err != nil {
		_ = file.Close()
		return fmt.Errorf("verification failed: %w", err)
	}
	if err := file.Close(); err != nil {
		return err
	}

	file, err = os.Open(*filePath)
	if err != nil {
		return err
	}
	manifest, err := securebackup.ExtractEncryptedArchive(file, key, *destination)
	closeErr := file.Close()
	if err != nil {
		return fmt.Errorf("extraction failed: %w", err)
	}
	if closeErr != nil {
		return closeErr
	}
	fmt.Printf("extracted verified backup: %s (%d media files)\n", manifest.CreatedAt.UTC().Format("2006-01-02T15:04:05Z"), manifest.MediaFiles)
	return nil
}

func keyFromEnvironment(name string) ([]byte, error) {
	value := os.Getenv(name)
	key, err := securebackup.ParseEncryptionKey(value)
	if err != nil {
		return nil, fmt.Errorf("%s: %w", name, err)
	}
	return key, nil
}

func usage() {
	fmt.Fprintln(os.Stderr, "用法:")
	fmt.Fprintln(os.Stderr, "  backupctl verify -file /app/backups/our-memories-full-*.ombak")
	fmt.Fprintln(os.Stderr, "  backupctl extract -file /app/backups/xxx.ombak -out /app/restore")
	fmt.Fprintln(os.Stderr, "密钥只从 FULL_BACKUP_ENCRYPTION_KEY（或 -key-env 指定的变量）读取，不会写入备份文件。")
}
