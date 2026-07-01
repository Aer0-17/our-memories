package services

import (
	"strings"
	"testing"
)

func TestAvatarSpritePromptIncludesPixelQualityGuardrails(t *testing.T) {
	prompt := avatarSpritePrompt(AvatarSpriteSpec{
		Prompt:         "short black hair and red scarf",
		Gender:         "female",
		ReferenceImage: "data:image/png;base64,abc",
	})

	for _, want := range []string{
		"crisp hand-placed pixel art",
		"clear hard pixel edges",
		"one complete full-body character",
		"Do not create a sprite sheet",
		"Negative prompt:",
		"blurry",
		"short black hair and red scarf",
	} {
		if !strings.Contains(prompt, want) {
			t.Fatalf("expected prompt to contain %q, got:\n%s", want, prompt)
		}
	}
}
