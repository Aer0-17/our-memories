package services

import (
	"bytes"
	"context"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"mime/multipart"
	"net/http"
	"net/textproto"
	"sort"
	"strings"
	"time"

	"our-memories-backend/utils"
)

const (
	imageGenerationGlobalSpaceID = "__global__"
	imageGenerationSettingsKey   = "imageGenerationNodes"
	maskedAPIKey                 = "********"
)

type ImageGenerationNode struct {
	ID        string `json:"id"`
	Name      string `json:"name"`
	BaseURL   string `json:"baseUrl"`
	APIKey    string `json:"apiKey,omitempty"`
	APIKeySet bool   `json:"apiKeySet,omitempty"`
	Model     string `json:"model"`
	Enabled   bool   `json:"enabled"`
	Priority  int    `json:"priority"`
}

type ImageGenerationSettings struct {
	Nodes []ImageGenerationNode `json:"nodes"`
}

type AvatarSpriteSpec struct {
	Prompt         string
	ReferenceImage string
	Gender         string
	DisplayName    string
}

type ImageGenerationResult struct {
	DataURL string
	NodeID  string
}

type ImageGenerator struct {
	settings ImageGenerationSettings
	client   *http.Client
}

func (s *SettingService) ImageGenerationSettings() (ImageGenerationSettings, error) {
	settings := ImageGenerationSettings{Nodes: []ImageGenerationNode{}}
	if err := s.repo.ReadJSON(imageGenerationGlobalSpaceID, imageGenerationSettingsKey, &settings); err != nil {
		return ImageGenerationSettings{}, err
	}
	settings.Nodes = normalizeImageGenerationNodes(settings.Nodes, nil)
	return settings, nil
}

func (s *SettingService) PublicImageGenerationSettings() (ImageGenerationSettings, error) {
	settings, err := s.ImageGenerationSettings()
	if err != nil {
		return ImageGenerationSettings{}, err
	}
	return maskImageGenerationSettings(settings), nil
}

func (s *SettingService) UpdateImageGenerationSettings(next ImageGenerationSettings) (ImageGenerationSettings, error) {
	current, err := s.ImageGenerationSettings()
	if err != nil {
		return ImageGenerationSettings{}, err
	}
	normalized := ImageGenerationSettings{
		Nodes: normalizeImageGenerationNodes(next.Nodes, current.Nodes),
	}
	if err := s.repo.UpsertJSON(utils.NewID(), imageGenerationGlobalSpaceID, imageGenerationSettingsKey, normalized); err != nil {
		return ImageGenerationSettings{}, err
	}
	return maskImageGenerationSettings(normalized), nil
}

func NewImageGenerator(settings ImageGenerationSettings) *ImageGenerator {
	return &ImageGenerator{
		settings: settings,
		client: &http.Client{
			Timeout: 90 * time.Second,
		},
	}
}

func (g *ImageGenerator) GenerateAvatarSprite(ctx context.Context, spec AvatarSpriteSpec) (ImageGenerationResult, error) {
	nodes := enabledImageGenerationNodes(g.settings.Nodes)
	if len(nodes) == 0 {
		return ImageGenerationResult{}, errors.New("image generation node not configured")
	}

	prompt := avatarSpritePrompt(spec)
	var errs []string
	for _, node := range nodes {
		if spec.ReferenceImage != "" {
			if dataURL, err := g.callImageEdit(ctx, node, prompt, spec.ReferenceImage); err == nil {
				return ImageGenerationResult{DataURL: dataURL, NodeID: node.ID}, nil
			} else {
				errs = append(errs, fmt.Sprintf("%s edit: %v", node.Name, err))
			}
		}
		if dataURL, err := g.callImageGeneration(ctx, node, prompt); err == nil {
			return ImageGenerationResult{DataURL: dataURL, NodeID: node.ID}, nil
		} else {
			errs = append(errs, fmt.Sprintf("%s generation: %v", node.Name, err))
		}
	}

	return ImageGenerationResult{}, fmt.Errorf("all image generation nodes failed: %s", strings.Join(errs, "; "))
}

func normalizeImageGenerationNodes(nodes []ImageGenerationNode, current []ImageGenerationNode) []ImageGenerationNode {
	currentByID := make(map[string]ImageGenerationNode, len(current))
	for _, node := range current {
		if node.ID != "" {
			currentByID[node.ID] = node
		}
	}

	normalized := make([]ImageGenerationNode, 0, len(nodes))
	for index, node := range nodes {
		id := strings.TrimSpace(node.ID)
		if id == "" {
			id = utils.NewID()
		}
		name := trimWithDefault(node.Name, fmt.Sprintf("生图节点 %d", index+1), 60)
		baseURL := strings.TrimRight(strings.TrimSpace(node.BaseURL), "/")
		model := trimWithDefault(node.Model, "gpt-image-1", 80)

		apiKey := strings.TrimSpace(node.APIKey)
		if apiKey == "" || apiKey == maskedAPIKey {
			apiKey = currentByID[id].APIKey
		}

		normalized = append(normalized, ImageGenerationNode{
			ID:        id,
			Name:      name,
			BaseURL:   baseURL,
			APIKey:    apiKey,
			APIKeySet: apiKey != "",
			Model:     model,
			Enabled:   node.Enabled,
			Priority:  node.Priority,
		})
	}

	sort.SliceStable(normalized, func(i, j int) bool {
		if normalized[i].Priority == normalized[j].Priority {
			return normalized[i].Name < normalized[j].Name
		}
		return normalized[i].Priority < normalized[j].Priority
	})
	return normalized
}

func maskImageGenerationSettings(settings ImageGenerationSettings) ImageGenerationSettings {
	nodes := make([]ImageGenerationNode, len(settings.Nodes))
	for index, node := range settings.Nodes {
		nodes[index] = node
		nodes[index].APIKeySet = node.APIKey != ""
		nodes[index].APIKey = ""
	}
	return ImageGenerationSettings{Nodes: nodes}
}

func enabledImageGenerationNodes(nodes []ImageGenerationNode) []ImageGenerationNode {
	enabled := make([]ImageGenerationNode, 0, len(nodes))
	for _, node := range nodes {
		if node.Enabled && node.BaseURL != "" && node.APIKey != "" && node.Model != "" {
			enabled = append(enabled, node)
		}
	}
	sort.SliceStable(enabled, func(i, j int) bool {
		if enabled[i].Priority == enabled[j].Priority {
			return enabled[i].Name < enabled[j].Name
		}
		return enabled[i].Priority < enabled[j].Priority
	})
	return enabled
}

func trimWithDefault(value string, fallback string, maxLength int) string {
	value = strings.TrimSpace(value)
	if value == "" {
		value = fallback
	}
	if len([]rune(value)) <= maxLength {
		return value
	}
	return string([]rune(value)[:maxLength])
}

func avatarSpritePrompt(spec AvatarSpriteSpec) string {
	genderHint := map[string]string{
		"female":  "cute young woman",
		"male":    "cute young man",
		"neutral": "cute human character",
	}[spec.Gender]
	if genderHint == "" {
		genderHint = "cute human character"
	}

	userPrompt := strings.TrimSpace(spec.Prompt)
	if userPrompt == "" {
		userPrompt = "friendly, warm, soft expression, suitable for a romantic memory map"
	}
	if len([]rune(userPrompt)) > 600 {
		userPrompt = string([]rune(userPrompt)[:600])
	}

	referenceHint := ""
	if spec.ReferenceImage != "" {
		referenceHint = "Use the uploaded reference photo only as appearance guidance while keeping the result original and pixel-art styled. "
	}

	return fmt.Sprintf(`Create one polished avatar sprite sheet for a couple memory map.
%sSubject: %s, full-body chibi human, original design, %s.
Style: high-end HD-2D 16-bit JRPG pixel art, detailed but readable at tiny map size, charming proportions, clean silhouette, expressive face, soft rim light, hand-crafted sprite look.
Layout: exactly four equal animation frames in one horizontal row, front-facing idle/walk loop, consistent character size and position, no panel borders.
Background: transparent PNG if supported; otherwise perfectly flat solid #00ff00 chroma-key background with no shadows or gradients.
Quality constraints: the character must clearly look human, cute, complete, and coherent. No text, watermark, logo, cropped limbs, extra characters, animal features, distorted face, broken hands, or messy pixels.`, referenceHint, genderHint, userPrompt)
}

func (g *ImageGenerator) callImageGeneration(ctx context.Context, node ImageGenerationNode, prompt string) (string, error) {
	payload := map[string]any{
		"model":           node.Model,
		"prompt":          prompt,
		"n":               1,
		"size":            "1024x1024",
		"response_format": "b64_json",
	}
	data, err := json.Marshal(payload)
	if err != nil {
		return "", err
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, node.BaseURL+"/images/generations", bytes.NewReader(data))
	if err != nil {
		return "", err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+node.APIKey)
	return g.decodeImageResponse(req)
}

func (g *ImageGenerator) callImageEdit(ctx context.Context, node ImageGenerationNode, prompt string, referenceImage string) (string, error) {
	imageBytes, mimeType, err := decodeDataURL(referenceImage)
	if err != nil {
		return "", err
	}

	var body bytes.Buffer
	writer := multipart.NewWriter(&body)
	_ = writer.WriteField("model", node.Model)
	_ = writer.WriteField("prompt", prompt)
	_ = writer.WriteField("n", "1")
	_ = writer.WriteField("size", "1024x1024")
	_ = writer.WriteField("response_format", "b64_json")

	header := make(textproto.MIMEHeader)
	header.Set("Content-Disposition", `form-data; name="image"; filename="reference.png"`)
	header.Set("Content-Type", mimeType)
	part, err := writer.CreatePart(header)
	if err != nil {
		return "", err
	}
	if _, err := part.Write(imageBytes); err != nil {
		return "", err
	}
	if err := writer.Close(); err != nil {
		return "", err
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, node.BaseURL+"/images/edits", &body)
	if err != nil {
		return "", err
	}
	req.Header.Set("Content-Type", writer.FormDataContentType())
	req.Header.Set("Authorization", "Bearer "+node.APIKey)
	return g.decodeImageResponse(req)
}

func (g *ImageGenerator) decodeImageResponse(req *http.Request) (string, error) {
	resp, err := g.client.Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		body, _ := io.ReadAll(io.LimitReader(resp.Body, 4096))
		return "", fmt.Errorf("node returned %d: %s", resp.StatusCode, strings.TrimSpace(string(body)))
	}

	var result struct {
		Data []struct {
			B64JSON string `json:"b64_json"`
			URL     string `json:"url"`
		} `json:"data"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return "", err
	}
	if len(result.Data) == 0 {
		return "", errors.New("empty image response")
	}
	if result.Data[0].B64JSON != "" {
		return "data:image/png;base64," + result.Data[0].B64JSON, nil
	}
	if result.Data[0].URL != "" {
		return g.downloadImage(req.Context(), result.Data[0].URL)
	}
	return "", errors.New("image response has no image payload")
}

func (g *ImageGenerator) downloadImage(ctx context.Context, url string) (string, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return "", err
	}
	resp, err := g.client.Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return "", fmt.Errorf("download returned %d", resp.StatusCode)
	}
	contentType := resp.Header.Get("Content-Type")
	if !strings.HasPrefix(contentType, "image/") {
		contentType = "image/png"
	}
	data, err := io.ReadAll(io.LimitReader(resp.Body, 20<<20))
	if err != nil {
		return "", err
	}
	if len(data) == 0 {
		return "", errors.New("downloaded image is empty")
	}
	return "data:" + contentType + ";base64," + base64.StdEncoding.EncodeToString(data), nil
}

func decodeDataURL(dataURL string) ([]byte, string, error) {
	if !strings.HasPrefix(dataURL, "data:image/") {
		return nil, "", errors.New("reference image must be a data URL")
	}
	parts := strings.SplitN(dataURL, ",", 2)
	if len(parts) != 2 {
		return nil, "", errors.New("invalid data URL")
	}
	mimeType := strings.TrimPrefix(strings.TrimSuffix(parts[0], ";base64"), "data:")
	data, err := base64.StdEncoding.DecodeString(parts[1])
	if err != nil {
		return nil, "", err
	}
	if len(data) == 0 {
		return nil, "", errors.New("reference image is empty")
	}
	return data, mimeType, nil
}
