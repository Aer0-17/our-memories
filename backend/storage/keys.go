package storage

import (
	"fmt"
	"net/url"
	"path"
	"strings"

	"our-memories-backend/config"
	"our-memories-backend/utils"
)

const localImageURLPrefix = "/local-images/"

// buildKey joins object key segments with slashes and cleans path traversal.
func buildKey(spaceID, folder, ext string) string {
	return path.Join(spaceID, folder, utils.NewID()+ext)
}

func publicURLForKey(cfg *config.Config, key string) string {
	key = strings.TrimLeft(key, "/")
	if cfg.S3PublicBaseURL != "" {
		return strings.TrimRight(cfg.S3PublicBaseURL, "/") + "/" + key
	}
	return fmt.Sprintf("%s/%s/%s", strings.TrimRight(cfg.S3Endpoint, "/"), strings.Trim(cfg.S3Bucket, "/"), key)
}

func localURLForKey(key string) string {
	return localImageURLPrefix + strings.TrimLeft(key, "/")
}

// PublicURLForKey returns the public URL for an existing object key.
func (s *S3Storage) PublicURLForKey(key string) string {
	key = strings.TrimLeft(strings.TrimSpace(key), "/")
	if key == "" {
		return ""
	}
	cfg := s.config()
	if cfg.S3PublicBaseURL == "" && cfg.S3Endpoint == "" {
		return ""
	}
	return publicURLForKey(cfg, key)
}

// KeyFromURL parses an object key from a public storage URL.
func (s *S3Storage) KeyFromURL(rawURL string) string {
	rawURL = strings.TrimSpace(rawURL)
	if rawURL == "" {
		return ""
	}
	cfg := s.config()

	for _, baseURL := range []string{
		cfg.S3PublicBaseURL,
		strings.TrimRight(cfg.S3Endpoint, "/") + "/" + strings.Trim(cfg.S3Bucket, "/"),
	} {
		if key := keyFromBaseURL(rawURL, baseURL); key != "" {
			return key
		}
	}

	if key := keyFromVirtualHostedURL(rawURL, cfg.S3Endpoint, cfg.S3Bucket); key != "" {
		return key
	}
	return ""
}

// LocalKeyFromURL returns the object key for a server-local fallback image URL.
func LocalKeyFromURL(rawURL string) string {
	rawURL = strings.TrimSpace(rawURL)
	if rawURL == "" {
		return ""
	}
	parsed, err := url.Parse(rawURL)
	if err == nil && parsed.Path != "" {
		rawURL = parsed.Path
	}
	if !strings.HasPrefix(rawURL, localImageURLPrefix) {
		return ""
	}
	return cleanObjectKeyFromURLPath(strings.TrimPrefix(rawURL, localImageURLPrefix))
}

func (s *S3Storage) LocalKeyFromURL(rawURL string) string {
	return LocalKeyFromURL(rawURL)
}

// KeyBelongsToSpace checks whether a key is under the given space prefix.
func KeyBelongsToSpace(key, spaceID string) bool {
	return spaceID != "" && strings.HasPrefix(key, spaceID+"/")
}

func (s *S3Storage) KeyBelongsToSpace(key, spaceID string) bool {
	return KeyBelongsToSpace(key, spaceID)
}

func keyFromBaseURL(rawURL, baseURL string) string {
	baseURL = strings.TrimRight(strings.TrimSpace(baseURL), "/")
	if rawURL == "" || baseURL == "" {
		return ""
	}

	parsedURL, urlErr := url.Parse(rawURL)
	parsedBase, baseErr := url.Parse(baseURL)
	if urlErr == nil && baseErr == nil && parsedURL.Scheme != "" && parsedBase.Scheme != "" {
		if !strings.EqualFold(parsedURL.Scheme, parsedBase.Scheme) || !sameHost(parsedURL.Host, parsedBase.Host) {
			return ""
		}

		basePath := strings.TrimRight(parsedBase.EscapedPath(), "/")
		rawPath := parsedURL.EscapedPath()
		if basePath == "" {
			return cleanObjectKeyFromURLPath(strings.TrimPrefix(rawPath, "/"))
		}
		prefix := basePath + "/"
		if !strings.HasPrefix(rawPath, prefix) {
			return ""
		}
		return cleanObjectKeyFromURLPath(strings.TrimPrefix(rawPath, prefix))
	}

	prefix := baseURL + "/"
	if !strings.HasPrefix(rawURL, prefix) {
		return ""
	}
	key := strings.TrimPrefix(rawURL, prefix)
	if cut := strings.IndexAny(key, "?#"); cut >= 0 {
		key = key[:cut]
	}
	return cleanObjectKeyFromURLPath(key)
}

func keyFromVirtualHostedURL(rawURL, endpoint, bucket string) string {
	if rawURL == "" || endpoint == "" || bucket == "" {
		return ""
	}

	parsedURL, err := url.Parse(rawURL)
	if err != nil || parsedURL.Host == "" {
		return ""
	}
	parsedEndpoint, err := url.Parse(endpoint)
	if err != nil {
		return ""
	}
	endpointHost := parsedEndpoint.Host
	if endpointHost == "" {
		endpointHost = parsedEndpoint.Path
	}
	if endpointHost == "" {
		return ""
	}

	if !sameHost(parsedURL.Host, bucket+"."+endpointHost) {
		return ""
	}
	return cleanObjectKeyFromURLPath(strings.TrimPrefix(parsedURL.EscapedPath(), "/"))
}

func sameHost(a, b string) bool {
	return strings.EqualFold(strings.TrimSuffix(a, "."), strings.TrimSuffix(b, "."))
}

func cleanObjectKeyFromURLPath(value string) string {
	value = strings.TrimLeft(value, "/")
	if value == "" {
		return ""
	}
	if unescaped, err := url.PathUnescape(value); err == nil {
		value = unescaped
	}
	for _, segment := range strings.Split(value, "/") {
		if segment == ".." {
			return ""
		}
	}
	value = path.Clean(value)
	if value == "." || strings.HasPrefix(value, "../") {
		return ""
	}
	return value
}
