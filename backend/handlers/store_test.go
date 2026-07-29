package handlers

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/gin-gonic/gin"
	"our-memories-backend/events"
)

func tripGuideRequest(t *testing.T, method string, path string, id string, payload gin.H) *httptest.ResponseRecorder {
	t.Helper()
	body, err := json.Marshal(gin.H{"payload": payload})
	if err != nil {
		t.Fatal(err)
	}
	w := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(w)
	c.Request = httptest.NewRequest(method, path, bytes.NewReader(body))
	c.Request.Header.Set("Content-Type", "application/json")
	if id != "" {
		c.Params = gin.Params{{Key: "id", Value: id}}
	}
	c.Set("spaceID", "space-1")
	c.Set("userID", "user-1")
	if method == http.MethodPost {
		CreateTripGuide(c)
	} else {
		UpdateTripGuide(c)
	}
	return w
}

func validTripGuidePayload() gin.H {
	return gin.H{
		"title":       "杭州两日",
		"origin":      "上海",
		"destination": "杭州",
		"days":        2,
		"status":      "planning",
		"daysPlan": []gin.H{
			{"day": 1, "checkpoints": []gin.H{{"id": "stop-1", "name": "西湖", "done": false}}},
			{"day": 2, "checkpoints": []gin.H{{"id": "stop-2", "name": "灵隐寺", "done": false}}},
		},
	}
}

func TestTripGuideLifecyclePublishesEvents(t *testing.T) {
	gin.SetMode(gin.TestMode)
	setupSignalHandlerTestDB(t)
	recorder := &signalEventRecorder{}
	SetEventPublisher(recorder)

	w := tripGuideRequest(t, http.MethodPost, "/api/v1/trip-guides", "", validTripGuidePayload())
	if w.Code != http.StatusOK {
		t.Fatalf("expected trip create to succeed, got %d: %s", w.Code, w.Body.String())
	}
	var created struct {
		Guide tripItem `json:"guide"`
	}
	if err := json.Unmarshal(w.Body.Bytes(), &created); err != nil {
		t.Fatal(err)
	}
	if created.Guide.ID == "" || len(recorder.items) != 1 || recorder.items[0].Type != events.TripGuideCreated {
		t.Fatalf("unexpected created trip or event: guide=%#v events=%#v", created.Guide, recorder.items)
	}

	payload := validTripGuidePayload()
	payload["status"] = "completed"
	w = tripGuideRequest(t, http.MethodPatch, "/api/v1/trip-guides/"+created.Guide.ID, created.Guide.ID, payload)
	if w.Code != http.StatusOK || len(recorder.items) != 2 || recorder.items[1].Type != events.TripGuideUpdated {
		t.Fatalf("unexpected trip update: code=%d body=%s events=%#v", w.Code, w.Body.String(), recorder.items)
	}

	w = httptest.NewRecorder()
	c, _ := gin.CreateTestContext(w)
	c.Request = httptest.NewRequest(http.MethodDelete, "/api/v1/trip-guides/"+created.Guide.ID, nil)
	c.Params = gin.Params{{Key: "id", Value: created.Guide.ID}}
	c.Set("spaceID", "space-1")
	c.Set("userID", "user-1")
	DeleteTripGuide(c)
	if w.Code != http.StatusOK || len(recorder.items) != 3 || recorder.items[2].Type != events.TripGuideDeleted {
		t.Fatalf("unexpected trip delete: code=%d body=%s events=%#v", w.Code, w.Body.String(), recorder.items)
	}
}

func TestTripGuideValidationRejectsUnsafePayloads(t *testing.T) {
	gin.SetMode(gin.TestMode)
	setupSignalHandlerTestDB(t)

	tests := []struct {
		name    string
		payload gin.H
	}{
		{name: "missing title", payload: gin.H{"destination": "杭州", "days": 1, "daysPlan": []gin.H{}}},
		{name: "too many days", payload: gin.H{"title": "远行", "destination": "杭州", "days": 31, "daysPlan": []gin.H{}}},
		{name: "oversized notes", payload: gin.H{"title": "远行", "destination": "杭州", "days": 1, "daysPlan": []gin.H{}, "notes": strings.Repeat("想", 2001)}},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			w := tripGuideRequest(t, http.MethodPost, "/api/v1/trip-guides", "", test.payload)
			if w.Code != http.StatusBadRequest {
				t.Fatalf("expected invalid trip to be rejected, got %d: %s", w.Code, w.Body.String())
			}
		})
	}
}
