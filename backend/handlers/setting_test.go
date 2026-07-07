package handlers

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/gin-gonic/gin"
	"our-memories-backend/events"
)

func TestFutureCheckinAuxiliaryItemsPublishRealtimeEvents(t *testing.T) {
	gin.SetMode(gin.TestMode)
	setupSignalHandlerTestDB(t)
	recorder := &signalEventRecorder{}
	SetEventPublisher(recorder)

	body, err := json.Marshal(gin.H{
		"kind":   "future-checkin",
		"title":  "浙江 杭州 中心区域",
		"cityId": "hangzhou",
		"note":   `{"provinceId":"zhejiang","cityName":"杭州","regionId":"region-330100","regionName":"中心区域","lng":120.2,"lat":30.2,"mascotVariant":2}`,
	})
	if err != nil {
		t.Fatal(err)
	}

	w := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(w)
	c.Request = httptest.NewRequest(http.MethodPost, "/api/v1/auxiliary-items", bytes.NewReader(body))
	c.Request.Header.Set("Content-Type", "application/json")
	c.Set("spaceID", "space-1")
	c.Set("userID", "user-1")

	CreateAuxiliaryItem(c)

	if w.Code != http.StatusOK {
		t.Fatalf("expected create future check-in to succeed, got %d: %s", w.Code, w.Body.String())
	}

	var created struct {
		ID string `json:"id"`
	}
	if err := json.Unmarshal(w.Body.Bytes(), &created); err != nil {
		t.Fatal(err)
	}
	if created.ID == "" {
		t.Fatalf("expected created id, got %#v", created)
	}
	if len(recorder.items) != 1 || recorder.items[0].Type != events.FutureCheckinCreated {
		t.Fatalf("expected future_checkin.created event, got %#v", recorder.items)
	}

	w = httptest.NewRecorder()
	c, _ = gin.CreateTestContext(w)
	c.Request = httptest.NewRequest(http.MethodDelete, "/api/v1/auxiliary-items/"+created.ID, nil)
	c.Params = gin.Params{{Key: "id", Value: created.ID}}
	c.Set("spaceID", "space-1")
	c.Set("userID", "user-1")

	DeleteAuxiliaryItem(c)

	if w.Code != http.StatusOK {
		t.Fatalf("expected delete future check-in to succeed, got %d: %s", w.Code, w.Body.String())
	}
	if len(recorder.items) != 2 || recorder.items[1].Type != events.FutureCheckinDeleted {
		t.Fatalf("expected future_checkin.deleted event, got %#v", recorder.items)
	}
}
