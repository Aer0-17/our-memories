# Hand-Drawn Animation Sprite Prompts

## Research Notes

- DAIR.AI Prompt Engineering Guide uses a strong structure: task, context, examples, constraints, and output format. Use that shape for every asset prompt.
- YouMind OpenLab's GPT Image prompt library reinforces image-specific fields: asset type, subject, composition, lighting, palette, materials, and negative constraints.
- AI spritesheet workflows need extra invariants: same character, same scale, same baseline, equal frame cells, no frame-boundary slicing, and no repeated/cropped limbs.

Sources:
- https://github.com/dair-ai/Prompt-Engineering-Guide
- https://github.com/YouMind-OpenLab/awesome-gpt-image-2
- https://github.com/altryne/awesome-ai-art-image-synthesis
- https://github.com/chongdashu/ai-game-spritesheets

## Style Anchor

Use this style language instead of naming a living artist or copying a film character:

```text
warm hand-painted storybook animation, soft watercolor-and-gouache texture,
clean cel-animation linework, gentle natural daylight, rounded friendly
proportions, earthy clothing colors, subtle wind-swept details, calm
countryside-adventure mood, original character design
```

Avoid:

```text
exact famous character, copyrighted character, specific studio, specific artist,
3D render, plastic toy, hard pixel edges, 16-bit JRPG, vector icon, sticker,
photorealistic, low quality, cropped limbs, text, watermark
```

## Single High-Resolution Map Traveler

```text
Use case: stylized-concept
Asset type: one high-resolution moving traveler image for a couple memory map
Primary request: create one original cute human traveler illustration for a couple memory map.
Subject: {gender}, full body, lively mid-step walking pose, {user_details}.
Style/medium: warm hand-painted storybook animation; soft watercolor-and-gouache
texture; clean cel-animation linework; gentle natural daylight; earthy clothing
colors; rounded friendly proportions.
Composition/framing: one polished square illustration, complete body visible,
feet visible, clear silhouette, readable face at 96-180 px wide.
Background: finished warm paper-map or travel-journal background with subtle
paths, rivers, location sketches, postcards, or foliage. Do not use transparent
background, chroma key, green screen, flat color backdrop, or sticker cutout.
Constraints: original design; no copied film character; no specific studio or
artist; no text; no watermark; no cropped head, hands, feet, hair, or accessories.
Avoid: sprite sheet, animation strip, multiple frames, frame boundary slicing,
transparent PNG, green screen, pixel art, hard pixel edges, 3D render, plastic toy, vector icon, sticker,
photorealistic, malformed anatomy, extra limbs.
```

## Four-Frame Walk Cycle

```text
Use case: stylized-concept
Asset type: horizontal 4-frame walk-cycle sprite sheet for a web map marker
Primary request: create a 4-frame horizontal animation strip of the same original
hand-drawn map avatar.
Subject: {gender}, same character in all frames, {user_details}.
Style/medium: warm hand-painted storybook animation; soft watercolor-and-gouache
texture; clean cel-animation linework; gentle natural daylight.
Composition/framing: exactly four equal-width cells in one row; no gutters; no
panel borders; each cell contains the complete full body; same head size, same
feet baseline, same scale, same outfit, same face, same color palette.
Frame plan: frame 1 neutral step, frame 2 left foot forward, frame 3 passing
pose, frame 4 right foot forward. Subtle arm swing only.
Background: perfectly flat solid #00ff00 chroma-key background across the entire
strip with no shadow, texture, paper grain, gradient, floor plane, or lighting
variation. Remove the background locally after generation instead of asking the
model for transparent output.
Constraints: original design; one character only; no cropped limbs; no repeated
or missing frames; no text or watermark.
Avoid: frame boundary slicing, uneven cells, different character per frame,
different scale, two rows, grid layout, 3D render, pixel art, hard pixel edges.
```

## Couple Three-Frame Marker

```text
Use case: stylized-concept
Asset type: horizontal 3-frame couple marker sprite sheet
Primary request: create a 3-frame horizontal animation strip of an original couple
standing close together for a memory map.
Subject: two cute humans holding hands, same couple in all frames, warm expression,
{user_details}.
Composition/framing: exactly three equal-width cells in one row; complete full
bodies in every cell; same baseline, scale, outfits, and faces.
Frame plan: frame 1 calm standing, frame 2 gentle hand squeeze and tiny lean,
frame 3 returning pose.
Style/medium: warm hand-painted storybook animation, watercolor-and-gouache
texture, clean cel-animation linework, natural daylight.
Constraints: original couple design; no copied characters; no text; no watermark;
no split bodies; no cropped hands or feet.
Avoid: separated panels, boundary slicing, inconsistent couple, extra people,
3D render, pixel art, hard pixel edges, photorealistic.
```

## Future Check-In Forest Spirit

```text
Use case: stylized-concept
Asset type: small map mascot marker
Primary request: create one original round forest spirit mascot for future travel
check-ins.
Subject: soft round woodland guardian, gentle eyes, tiny leaf detail, small cream
belly, friendly expression, original creature design.
Style/medium: warm hand-painted storybook animation; soft gouache texture; clean
cel-animation linework; earthy grey, moss green, warm cream palette.
Composition/framing: centered full body, readable at 32-48 px, transparent padding.
Constraints: original design; do not copy any film creature or famous mascot; no
text; no watermark.
Avoid: exact famous character, copyrighted character, scary monster, photorealism,
3D render, plastic toy, hard pixel edges.
```
