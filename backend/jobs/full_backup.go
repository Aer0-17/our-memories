package jobs

import (
	"context"
	"log"
	"time"

	"our-memories-backend/securebackup"
)

func StartFullBackup(service *securebackup.Service, interval time.Duration) {
	if service == nil || !service.Enabled() {
		log.Printf("encrypted full backup disabled")
		return
	}
	checkInterval := time.Hour
	if interval < checkInterval {
		checkInterval = interval
	}
	log.Printf(
		"encrypted full backup scheduled: interval=%s retention=%d encryption=AES-256-GCM",
		interval,
		service.Status().RetentionCount,
	)

	go func() {
		time.Sleep(30 * time.Second)
		runDueFullBackup(service)

		ticker := time.NewTicker(checkInterval)
		defer ticker.Stop()
		for range ticker.C {
			runDueFullBackup(service)
		}
	}()
}

func runDueFullBackup(service *securebackup.Service) {
	if !service.Due(time.Now().UTC()) {
		return
	}
	start := time.Now()
	result, err := service.Create(context.Background(), "scheduled")
	if err != nil {
		log.Printf("encrypted full backup failed: duration=%s err=%v", time.Since(start).Round(time.Millisecond), err)
		return
	}
	log.Printf(
		"encrypted full backup finished: file=%s size=%d media_files=%d duration=%s",
		result.Backup.FileName,
		result.Backup.Size,
		result.Backup.MediaFiles,
		time.Since(start).Round(time.Millisecond),
	)
	if result.Warning != "" {
		log.Printf("encrypted full backup maintenance warning: %s", result.Warning)
	}
}
