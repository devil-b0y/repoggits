# Homepage build story

## Current clean layout

The homepage now separates hero copy from a rounded photographic panel. It retains subtle hand-pose blends and the scroll-driven 3D objects, but no longer mounts the particle dissolve or finale photo collage. Headings use short translation-only reveals, with no blur, clipping, looping shimmer, or flashing button highlights. `clean-home.css` scopes the smaller typography, spacing, card surfaces, and responsive layout to the homepage. Existing artwork is reused; no new images were generated for this revision.

`tests/clean-home.spec.ts` checks that hero text stays separate from imagery at 320px, 390px, 834px, and 1440px, along with navigation and dark mode. The historical implementation notes below document the earlier artwork and motion work; the particle and finale treatments described there are no longer active.

The homepage uses original AI-created editorial illustrations, generated with the built-in image generation tool. They depict coding and an illustrative ESP32 irrigation project, not an actual submitted project or verified student team. The homepage includes a discreet illustration credit.

Initial electronics artwork: `public/images/maker-story/student.webp`, `circuit.webp`, `team.webp`, with 768px `-mobile.webp` variants. Desktop images are 1536 × 1024. These six WebP files total approximately 730 KB; the later coding and hand-pose assets are documented below. The first scene loads eagerly; subsequent full-size scenes load lazily. No Shopify artwork is included.

## Final generation prompts

### Student

Photorealistic editorial photograph for an Indian college student project showcase website. Wide cinematic 1536x1024 composition. An adult Indian male engineering student aged 21 wearing a plain cobalt blue overshirt, seated at a real cream workbench in a bright college electronics makerspace, focused on assembling an ESP32 development board with a clearly recognizable metal WiFi module and black PCB on a white breadboard, red orange blue jumper wires connected to a small soil moisture sensor and tiny green plant in a terracotta pot. Student positioned on RIGHT third, natural realistic face and hands, right hand carefully connecting jumper wire, left resting by breadboard. LEFT half shows softly blurred cream workshop wall with subtle circuit sketches and blue shelves, spacious negative area for navy website headline. Foreground workbench and components large enough to recognize. Warm window sunlight, authentic documentary photography, 35mm lens, shallow depth of field but circuit board readable, professional editorial color grading. Cream ivory and cobalt blue with restrained orange accents. Realistic lived-in student lab, no fantasy architecture, no floating objects, no rendered plastic style, no text, no watermark, no brand logos.

### Circuit

Photorealistic close-up editorial photograph, 1536x1024 landscape, of a real ESP32 student smart irrigation prototype on an ivory college lab workbench. Low macro camera angle. Black ESP32 development board with silver rectangular WiFi module and gold pin headers mounted on a white breadboard, elegantly arcing blue red orange jumper wires, small blue sensor module, tiny lit green LED. An adult Indian student's natural fingers gently adjusting a wire at upper right, cobalt blue shirt softly blurred in background, terracotta plant pot at upper left in bokeh, cream notebook with hand drawn wiring diagram partly visible bottom. Authentic functional student electronics not futuristic or toy. Warm afternoon sunlight, rich material texture of solder metal PCB and matte plastic, shallow depth of field focused on ESP32 module, cinematic magazine photography. Main board in right half, left half darker blurred blue workshop area for white title. No overlaid text, no logo, no watermark.

### Team

Photorealistic documentary editorial photograph for Indian college student project platform, wide landscape 1536x1024. Three adult Indian engineering students aged 21, two men and one woman, collaborating around cream electronics laboratory workbench, naturally smiling with pride as they test their working small ESP32 smart plant irrigation prototype: terracotta plant pot, white breadboard with black ESP32 board, jumper wires and small water pump, laptop displaying a simple blue line chart (no legible text). Boy in cobalt blue overshirt at right, woman in ivory shirt at center, boy in rust orange tee at left. Candid authentic college lab with blue shelving, afternoon window light, natural realistic faces and anatomically correct hands, tactile components, sophisticated warm editorial photography, 35mm lens. Students grouped in right two thirds, softly blurred deep cobalt lab left for white headline. Not stock corporate handshake, not CGI, no fantasy objects, no overlaid text or watermark or logos.

## Motion and maintenance

`MakerStory.tsx` links three scenes to native scroll progress, blending and gently scaling images. Thumbnail buttons support direct selection. Pause and reduced motion keep the scene still while preserving manual selection. `CircuitChapter` adds a separate close-up chapter with decorative parallax and button-press activity. Shared overview pause controls continue to stop the existing 3D models.

`tests/edition.spec.ts` covers scene selection, scroll progression, pause stability, chapter navigation, mobile reduced motion, overflow, and the submission link. Existing model and overview tests remain applicable.

## Coding scene correction

The opening now uses `coding-v2.webp` and `coding-next-v2.webp`, plus matching `-mobile.webp` files in `public/images/maker-story/`. These were created with the built-in image generation tool. The original coding images had incorrect laptop orientation and are no longer referenced by the homepage.

Final base prompt: A candid unretouched documentary photograph, landscape 1536x1024, of an adult Indian male university student coding in a modest college room. Camera behind and slightly left of the student, over his left shoulder, looking in the same direction. Student on right third. Laptop directly in front, screen facing student and camera, keyboard below the screen and between torso and screen, hands resting on keyboard from near side. Scratched cream desk, notebook, orange mug, blue-grey plaster wall, natural cloudy afternoon light, realistic skin and fabric, uncluttered left half for headline, no artificial bloom or plastic CGI appearance.

Second-frame prompt: Edit this photograph as a matching second animation frame. Keep everything absolutely identical: exact over-left-shoulder camera, same person, exact laptop orientation with screen facing student, screen and keyboard dimensions and placement, shirt, desk, wall, lighting, color, framing, all background. Change ONLY fingertips on the keyboard by a few millimeters to suggest another typing keystroke. Do not move wrists, arms, head, laptop, camera, or ANY other object. Preserve unretouched photographic realism. Output same 1536x1024 composition.

`CodingScene.tsx` blends these matching poses, adds a subtle pointer-dependent depth shift and a decorative code panel. This is a layered image animation, not recorded video. Pause, reduced motion, offscreen detection, and hidden-tab handling stop its animations. `tests/coding-scene.spec.ts` checks movement, actual animation-time stability when paused, and mobile reduced motion.

## Dimensional homepage additions

`PhotoDissolve.tsx` uses Three.js to scatter a sampled image into approximately 32,000 textured points during native-scroll scene transitions. The original photographic layers remain underneath as a fallback when WebGL is unavailable. The effect stops under reduced motion, pause, and hidden-tab conditions and releases textures and geometry on unmount.

`BuildShowcase.tsx` opens three perspective-transformed project cards as the visitor scrolls. The cards describe the source, working demo, and team, with a working link to project discovery. It retains a still composition under reduced motion and shares the homepage pause control. Regression coverage is in `tests/creative-showcase.spec.ts`.

## Living homepage scenes

`MakerObjects.tsx` renders a real Three.js foreground sequence over the photographs: a laptop, an assembling ESP32-style development board, and three project sheets. Native scroll controls rotation, assembly and transitions. Rendering runs on demand while a pose settles, stops offscreen or in a hidden tab, and freezes under pause or reduced motion. The canvas has a CSS board fallback if WebGL is unavailable.

`CircuitScene.tsx` adds a second matching hand pose. In the opening it forms a short photographic loop. In the dedicated electronics chapter the hand's button press follows scroll progress, alongside a clearly illustrative sensor reading. Connect, Upload and It works buttons also select stages, including under reduced motion. This remains a layered image illustration rather than video or live hardware telemetry.

New assets generated with the **built-in image generation tool**: `public/images/maker-story/circuit-next.webp` (1536px wide, about 170 KB) and `public/images/maker-story/circuit-next-mobile.webp` (768px wide, about 57 KB). The original circuit image was the edit reference. Final prompt:

> Use case: precise-object-edit. This is the second matching photographic frame of a scroll-driven cinemagraph on a student project showcase website. Edit target: supplied ESP32 electronics workbench image. Preserve the exact camera, crop, perspective, circuit board, breadboard, jumper wires, plant, notebook, lighting and background. Change ONLY the adult student's right hand: move the hand slightly down and left, pressing the little board's button with one fingertip, now with the red jumper already firmly connected. Natural anatomy with five fingers, natural detailed skin. A tiny green indicator is lit. Keep all objects in the exact same places so this can crossfade with the first frame. Photorealistic editorial macro photography, same blue shirt and warm daylight. No extra text, no new objects, no change to the circuit board or camera. Output same landscape aspect ratio as reference, clean high resolution.

`BuildShowcase.tsx` now reveals code lines, circuit connections, a signal trace, and team detail as the cards open. Its accessible chapter buttons expose all cards on phones and with motion disabled. `HomeMotion.tsx` batches decorative scroll updates for the discipline ribbon, section accents, heading reveals and closing photo collage. It never intercepts the wheel or touch scrolling.

`tests/living-home.spec.ts` covers model progression and pause, all prototype controls and image loading, the three project story controls, and mobile/landscape overflow and reduced-motion behavior. Existing homepage and submission regression tests remain in place.

## Team activity and journey progression

`TeamScene.tsx` brings hand movement into the hero's people chapter and collective backdrop. A source-aligned SVG mask limits the second photographic pose to the blue-shirt student's hand and board. Faces, the other students, and the camera stay on the original image. Motion pauses offscreen, in hidden tabs, under reduced motion, and with the shared pause control. The phone coding crop now keeps more of the student in view.

New assets from the **built-in image generation tool**: `public/images/maker-story/team-next.webp` (1536px, approximately 147 KB), and `team-next-mobile.webp` (768px, approximately 53 KB). `team-hands-mask.svg` is the code-authored compositing mask. Final generation prompt:

> Use case: precise-object-edit. Create a matching second photograph frame for a layered image animation of adult engineering students testing their ESP32 plant project. Edit target: supplied photograph. Preserve exactly the camera position, lens, crop, composition, three students' identities, heads, faces, expressions, clothes, laboratory background, laptop position and orientation, plant pot, breadboard and lighting. Change only the woman's right hand holding the moisture sensor: her fingers and the sensor now sit slightly lower, with the two metal sensor probes entering the soil at the right edge of the plant pot. Change only the blue-shirt student's index fingertip position slightly downward pressing the development board button. Keep wrists, arms, and everything else identical. Natural anatomically correct hands, detailed unretouched photographic realism, consistent warm afternoon light. No new people, no text or logos, no camera movement. Same landscape 1536x1024 composition.

Only the board-button portion of this output is used in the animation; the original woman's hand and sensor remain visible through the mask. This is a layered illustration, not recorded footage.

`NextChapter.tsx` now advances the build/share/version tableau as its existing illustration passes through the viewport, without another pinned section. The code lines, project attachments, demo progress, and version entries assemble by stage. Manual buttons override scrolling temporarily and remain usable when motion is disabled. Hero scene buttons now select the matching 3D object under pause and reduced motion as well. Regression coverage: `tests/team-scene.spec.ts` and `tests/journey-scroll.spec.ts`.

On phones, the motion control sits above the scene thumbnails once the chapter dock appears; tests check actual pointer access at 320px and 390px. The 3D hero also repaints after an offscreen resize even when motion is paused or reduced. `tests/maker-object-lifecycle.spec.ts` verifies real WebGL draw calls resume when the resized canvas returns to view.
