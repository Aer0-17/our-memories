package jobs

import (
	"context"
	"database/sql"
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

func TestCleanupExcessNotificationsKeepsLatestThreePerUser(t *testing.T) {
	database := setupSchedulerTestDB(t)
	if err := database.Exec(`
		INSERT INTO notifications (id, space_id, user_id, type, target_type, target_id, title, body, is_read, created_at)
		VALUES
			('n-1', 'space-1', 'user-1', 'memory.created', 'memory', 'm-1', '1', '', 0, '2026-06-26T00:00:00Z'),
			('n-2', 'space-1', 'user-1', 'memory.created', 'memory', 'm-2', '2', '', 0, '2026-06-27T00:00:00Z'),
			('n-3', 'space-1', 'user-1', 'memory.created', 'memory', 'm-3', '3', '', 0, '2026-06-28T00:00:00Z'),
			('n-4', 'space-1', 'user-1', 'memory.created', 'memory', 'm-4', '4', '', 0, '2026-06-29T00:00:00Z'),
			('n-5', 'space-1', 'user-2', 'memory.created', 'memory', 'm-5', '5', '', 0, '2026-06-25T00:00:00Z'),
			('n-6', 'space-1', 'user-2', 'memory.created', 'memory', 'm-6', '6', '', 0, '2026-06-26T00:00:00Z'),
			('n-7', 'space-1', 'user-2', 'memory.created', 'memory', 'm-7', '7', '', 0, '2026-06-27T00:00:00Z');
	`).Error; err != nil {
		t.Fatal(err)
	}

	if err := cleanupExcessNotifications(database); err != nil {
		t.Fatal(err)
	}

	var ids []string
	if err := database.
		Table("notifications").
		Select("id").
		Order("user_id ASC, created_at ASC").
		Pluck("id", &ids).
		Error; err != nil {
		t.Fatal(err)
	}
	want := []string{"n-2", "n-3", "n-4", "n-5", "n-6", "n-7"}
	if strings.Join(ids, ",") != strings.Join(want, ",") {
		t.Fatalf("expected notifications %v, got %v", want, ids)
	}
}
