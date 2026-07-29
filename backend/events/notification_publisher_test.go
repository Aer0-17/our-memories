package events

import (
	"context"
	"testing"
)

type fakeNotificationStore struct {
	spaceID    string
	userIDs    []string
	eventType  string
	targetType string
	targetID   string
	title      string
	body       string
}

func (s *fakeNotificationStore) CreateForUsers(spaceID string, userIDs []string, eventType string, targetType string, targetID string, title string, body string) error {
	s.spaceID = spaceID
	s.userIDs = append([]string{}, userIDs...)
	s.eventType = eventType
	s.targetType = targetType
	s.targetID = targetID
	s.title = title
	s.body = body
	return nil
}

type fakeSpaceUsers struct {
	userIDs []string
}

func (u fakeSpaceUsers) UserIDsForSpaceExcept(string, string) ([]string, error) {
	return u.userIDs, nil
}

func TestNotificationPublisherPersistsRecognizedEvents(t *testing.T) {
	store := &fakeNotificationStore{}
	publisher := NewNotificationPublisher(store, fakeSpaceUsers{userIDs: []string{"user-2"}})

	err := publisher.Publish(context.Background(), DomainEvent{
		Type:     MemoryCreated,
		SpaceID:  "space-1",
		ActorID:  "user-1",
		TargetID: "memory-1",
	})
	if err != nil {
		t.Fatal(err)
	}
	if store.spaceID != "space-1" || len(store.userIDs) != 1 || store.userIDs[0] != "user-2" {
		t.Fatalf("unexpected recipients: %#v", store)
	}
	if store.eventType != string(MemoryCreated) || store.targetType != "memory" || store.targetID != "memory-1" {
		t.Fatalf("unexpected notification target: %#v", store)
	}
	if store.title == "" || store.body == "" {
		t.Fatalf("expected notification copy, got %#v", store)
	}
}

func TestNotificationPublisherRoutesTripGuides(t *testing.T) {
	store := &fakeNotificationStore{}
	publisher := NewNotificationPublisher(store, fakeSpaceUsers{userIDs: []string{"user-2"}})

	if err := publisher.Publish(context.Background(), DomainEvent{
		Type:     TripGuideCreated,
		SpaceID:  "space-1",
		ActorID:  "user-1",
		TargetID: "trip-1",
	}); err != nil {
		t.Fatal(err)
	}
	if store.eventType != string(TripGuideCreated) || store.targetType != "trip_guide" || store.targetID != "trip-1" {
		t.Fatalf("unexpected trip notification target: %#v", store)
	}
	if store.title == "" || store.body == "" {
		t.Fatalf("expected trip notification copy, got %#v", store)
	}
}

func TestNotificationPublisherRoutesCoupleQuestions(t *testing.T) {
	for _, eventType := range []Type{CoupleQuestionCreated, CoupleQuestionAnswered, CoupleQuestionRevealed} {
		store := &fakeNotificationStore{}
		publisher := NewNotificationPublisher(store, fakeSpaceUsers{userIDs: []string{"user-2"}})

		if err := publisher.Publish(context.Background(), DomainEvent{
			Type:     eventType,
			SpaceID:  "space-1",
			ActorID:  "user-1",
			TargetID: "question-1",
		}); err != nil {
			t.Fatal(err)
		}
		if store.eventType != string(eventType) || store.targetType != "couple_question" || store.targetID != "question-1" {
			t.Fatalf("unexpected couple question notification for %s: %#v", eventType, store)
		}
		if store.title == "" || store.body == "" {
			t.Fatalf("expected couple question notification copy for %s, got %#v", eventType, store)
		}
	}
}
