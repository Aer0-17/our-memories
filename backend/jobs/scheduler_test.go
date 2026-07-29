package jobs

import (
	"context"
	"database/sql"
	"fmt"
	"strings"
	"testing"
	"time"

	_ "github.com/glebarez/sqlite"
	sqlitegorm "github.com/glebarez/sqlite"
	"gorm.io/gorm"
	"our-memories-backend/cache"
	"our-memories-backend/dbschema"
	"our-memories-backend/events"
)

type recordedPublisher struct {
	items []events.DomainEvent
}

func (p *recordedPublisher) Publish(_ context.Context, event events.DomainEvent) error {
	p.items = append(p.items, event)
	return nil
}

func setupSchedulerTestDB(t *testing.T) *gorm.DB {
	t.Helper()
	cache.Clear()
	name := strings.NewReplacer("/", "-", " ", "-", ":", "-").Replace(t.Name())
	sqlDB, err := sql.Open("sqlite", "file:"+name+"?mode=memory&cache=shared&_foreign_keys=on")
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() {
		cache.Clear()
		_ = sqlDB.Close()
	})
	gormDB, err := gorm.Open(sqlitegorm.Dialector{Conn: sqlDB}, &gorm.Config{})
	if err != nil {
		t.Fatal(err)
	}
	if err := dbschema.AutoMigrate(gormDB); err != nil {
		t.Fatal(err)
	}
	return gormDB
}

func TestRunSchedulerOnceDispatchesDueEventsOncePerDay(t *testing.T) {
	database := setupSchedulerTestDB(t)
	now := time.Date(2026, 6, 30, 10, 0, 0, 0, time.UTC)
	if err := database.Exec(`
		INSERT INTO time_capsules (id, space_id, title, open_date, content, created_by_id, is_opened)
		VALUES ('capsule-1', 'space-1', 'Past Capsule', '2026-06-29', 'open', 'user-1', 0);
		INSERT INTO anniversary_cards (id, space_id, title, date, note, repeat_yearly)
		VALUES ('anniversary-1', 'space-1', 'First Date', '2026-07-02', 'soon', 1);
	`).Error; err != nil {
		t.Fatal(err)
	}
	publisher := &recordedPublisher{}

	count, err := RunSchedulerOnce(context.Background(), database, publisher, now)
	if err != nil {
		t.Fatal(err)
	}
	if count != 2 || len(publisher.items) != 2 {
		t.Fatalf("expected two scheduled events, count=%d items=%#v", count, publisher.items)
	}
	seen := map[events.Type]bool{}
	for _, item := range publisher.items {
		seen[item.Type] = true
	}
	if !seen[events.TimeCapsuleDue] || !seen[events.AnniversaryNear] {
		t.Fatalf("expected capsule due and anniversary near events, got %#v", publisher.items)
	}

	count, err = RunSchedulerOnce(context.Background(), database, publisher, now.Add(2*time.Hour))
	if err != nil {
		t.Fatal(err)
	}
	if count != 0 || len(publisher.items) != 2 {
		t.Fatalf("expected same-day scheduler de-dupe, count=%d items=%#v", count, publisher.items)
	}
}

func TestCleanupExcessNotificationsKeepsLatestHundredPerUser(t *testing.T) {
	database := setupSchedulerTestDB(t)
	records := make([]dbschema.Notification, 0, 105)
	for index := 1; index <= 105; index++ {
		records = append(records, dbschema.Notification{
			ID:         fmt.Sprintf("n-%03d", index),
			SpaceID:    "space-1",
			UserID:     "user-1",
			Type:       "memory.created",
			TargetType: "memory",
			TargetID:   fmt.Sprintf("m-%03d", index),
			Title:      fmt.Sprintf("%d", index),
			CreatedAt:  time.Date(2026, 1, 1, 0, index, 0, 0, time.UTC).Format(time.RFC3339),
		})
	}
	if err := database.Create(&records).Error; err != nil {
		t.Fatal(err)
	}

	if err := cleanupExcessNotifications(database); err != nil {
		t.Fatal(err)
	}

	var ids []string
	if err := database.
		Table("notifications").
		Select("id").
		Order("created_at ASC, id ASC").
		Pluck("id", &ids).
		Error; err != nil {
		t.Fatal(err)
	}
	if len(ids) != 100 || ids[0] != "n-006" || ids[len(ids)-1] != "n-105" {
		t.Fatalf("expected latest 100 notifications n-006..n-105, got first=%q last=%q count=%d", ids[0], ids[len(ids)-1], len(ids))
	}
}
