# Homepage build story

The homepage uses three original AI-created editorial illustrations, generated with the built-in image generation tool. They depict an illustrative ESP32 irrigation project, not an actual submitted project or verified student team. The homepage includes a discreet illustration credit.

Assets: `public/images/maker-story/student.webp`, `circuit.webp`, `team.webp`, with 768px `-mobile.webp` variants. Desktop images are 1536 × 1024. The six WebP files total approximately 730 KB. The first scene loads eagerly; subsequent full-size scenes load lazily. No Shopify artwork is included.

## Final generation prompts

### Student

Photorealistic editorial photograph for an Indian college student project showcase website. Wide cinematic 1536x1024 composition. An adult Indian male engineering student aged 21 wearing a plain cobalt blue overshirt, seated at a real cream workbench in a bright college electronics makerspace, focused on assembling an ESP32 development board with a clearly recognizable metal WiFi module and black PCB on a white breadboard, red orange blue jumper wires connected to a small soil moisture sensor and tiny green plant in a terracotta pot. Student positioned on RIGHT third, natural realistic face and hands, right hand carefully connecting jumper wire, left resting by breadboard. LEFT half shows softly blurred cream workshop wall with subtle circuit sketches and blue shelves, spacious negative area for navy website headline. Foreground workbench and components large enough to recognize. Warm window sunlight, authentic documentary photography, 35mm lens, shallow depth of field but circuit board readable, professional editorial color grading. Cream ivory and cobalt blue with restrained orange accents. Realistic lived-in student lab, no fantasy architecture, no floating objects, no rendered plastic style, no text, no watermark, no brand logos.

### Circuit

Photorealistic close-up editorial photograph, 1536x1024 landscape, of a real ESP32 student smart irrigation prototype on an ivory college lab workbench. Low macro camera angle. Black ESP32 development board with silver rectangular WiFi module and gold pin headers mounted on a white breadboard, elegantly arcing blue red orange jumper wires, small blue sensor module, tiny lit green LED. An adult Indian student's natural fingers gently adjusting a wire at upper right, cobalt blue shirt softly blurred in background, terracotta plant pot at upper left in bokeh, cream notebook with hand drawn wiring diagram partly visible bottom. Authentic functional student electronics not futuristic or toy. Warm afternoon sunlight, rich material texture of solder metal PCB and matte plastic, shallow depth of field focused on ESP32 module, cinematic magazine photography. Main board in right half, left half darker blurred blue workshop area for white title. No overlaid text, no logo, no watermark.

### Team

Photorealistic documentary editorial photograph for Indian college student project platform, wide landscape 1536x1024. Three adult Indian engineering students aged 21, two men and one woman, collaborating around cream electronics laboratory workbench, naturally smiling with pride as they test their working small ESP32 smart plant irrigation prototype: terracotta plant pot, white breadboard with black ESP32 board, jumper wires and small water pump, laptop displaying a simple blue line chart (no legible text). Boy in cobalt blue overshirt at right, woman in ivory shirt at center, boy in rust orange tee at left. Candid authentic college lab with blue shelving, afternoon window light, natural realistic faces and anatomically correct hands, tactile components, sophisticated warm editorial photography, 35mm lens. Students grouped in right two thirds, softly blurred deep cobalt lab left for white headline. Not stock corporate handshake, not CGI, no fantasy objects, no overlaid text or watermark or logos.

## Motion and maintenance

`MakerStory.tsx` links the three images to native scroll progress, blending and gently scaling scenes. Thumbnail buttons support direct selection. Pause and reduced motion keep the scene still while preserving manual selection. `PhotoChapter` adds a separate close-up chapter with decorative parallax. Shared overview pause controls continue to stop the existing 3D models.

`tests/edition.spec.ts` covers scene selection, scroll progression, pause stability, chapter navigation, mobile reduced motion, overflow, and the submission link. Existing model and overview tests remain applicable.

## Coding scene correction

The opening now uses `coding-v2.webp` and `coding-next-v2.webp`, plus matching `-mobile.webp` files in `public/images/maker-story/`. These were created with the built-in image generation tool. The original coding images had incorrect laptop orientation and are no longer referenced by the homepage.

Final base prompt: A candid unretouched documentary photograph, landscape 1536x1024, of an adult Indian male university student coding in a modest college room. Camera behind and slightly left of the student, over his left shoulder, looking in the same direction. Student on right third. Laptop directly in front, screen facing student and camera, keyboard below the screen and between torso and screen, hands resting on keyboard from near side. Scratched cream desk, notebook, orange mug, blue-grey plaster wall, natural cloudy afternoon light, realistic skin and fabric, uncluttered left half for headline, no artificial bloom or plastic CGI appearance.

Second-frame prompt: Edit this photograph as a matching second animation frame. Keep everything absolutely identical: exact over-left-shoulder camera, same person, exact laptop orientation with screen facing student, screen and keyboard dimensions and placement, shirt, desk, wall, lighting, color, framing, all background. Change ONLY fingertips on the keyboard by a few millimeters to suggest another typing keystroke. Do not move wrists, arms, head, laptop, camera, or ANY other object. Preserve unretouched photographic realism. Output same 1536x1024 composition.

`CodingScene.tsx` blends these matching poses, adds a subtle pointer-dependent depth shift and a decorative code panel. This is a layered image animation, not recorded video. Pause, reduced motion, offscreen detection, and hidden-tab handling stop its animations. `tests/coding-scene.spec.ts` checks movement, actual animation-time stability when paused, and mobile reduced motion.

## Dimensional homepage additions

`PhotoDissolve.tsx` uses Three.js to scatter a sampled image into approximately 32,000 textured points during native-scroll scene transitions. The original photographic layers remain underneath as a fallback when WebGL is unavailable. The effect stops under reduced motion, pause, and hidden-tab conditions and releases textures and geometry on unmount.

`BuildShowcase.tsx` opens three perspective-transformed project cards as the visitor scrolls. The cards describe the source, working demo, and team, with a working link to project discovery. It retains a still composition under reduced motion and shares the homepage pause control. Regression coverage is in `tests/creative-showcase.spec.ts`.
