package models

type Space struct {
	ID           string `json:"id"`
	SpaceCode    string `json:"spaceCode"`
	PasswordHash string `json:"-"`
	Name         string `json:"name"`
	CreatedAt    string `json:"createdAt"`
	UpdatedAt    string `json:"updatedAt"`
}

type User struct {
	ID          string `json:"id"`
	SpaceID     string `json:"spaceId"`
	Username    string `json:"username"`
	DisplayName string `json:"displayName"`
	Avatar      string `json:"avatar,omitempty"`
	CreatedAt   string `json:"createdAt"`
}

type Memory struct {
	ID            string   `json:"id"`
	SpaceID       string   `json:"spaceId"`
	CityID        string   `json:"cityId"`
	City          string   `json:"city"`
	CityEn        string   `json:"cityEn"`
	Title         string   `json:"title,omitempty"`
	Date          string   `json:"date"`
	Text          string   `json:"text"`
	Mood          string   `json:"mood,omitempty"`
	Tags          []string `json:"tags"`
	Visibility    string   `json:"visibility"`
	PartnerNote   string   `json:"partnerNote,omitempty"`
	PlaceName     string   `json:"placeName,omitempty"`
	CoverPhotoID  string   `json:"coverPhotoId,omitempty"`
	CreatedByID   string   `json:"createdById,omitempty"`
	CreatedAt     string   `json:"createdAt"`
	UpdatedAt     string   `json:"updatedAt"`
	Photos        []Photo  `json:"photos,omitempty"`
}

type Photo struct {
	ID        string `json:"id"`
	MemoryID  string `json:"memoryId"`
	Key       string `json:"key"`
	URL       string `json:"url"`
	MimeType  string `json:"mimeType,omitempty"`
	Width     int    `json:"width,omitempty"`
	Height    int    `json:"height,omitempty"`
	SortOrder int    `json:"sortOrder"`
	CreatedAt string `json:"createdAt"`
}

type AnniversaryCard struct {
	ID           string  `json:"id"`
	SpaceID      string  `json:"spaceId"`
	Title        string  `json:"title"`
	Date         string  `json:"date"`
	Note         string  `json:"note"`
	CoverPhotoID string  `json:"coverPhotoId,omitempty"`
	RepeatYearly bool    `json:"repeatYearly"`
	Pinned       bool    `json:"pinned"`
	SortOrder    int     `json:"sortOrder"`
	CreatedByID  string  `json:"createdById,omitempty"`
	CreatedAt    string  `json:"createdAt"`
	UpdatedAt    string  `json:"updatedAt"`
	Photos       []Photo `json:"photos,omitempty"`
}
