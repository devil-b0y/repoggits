# Sample media provenance

The dashboard, cover, task dialog, completed-task view, mobile screenshot, and public `demo.webm` show the working CampusFlow demo. Regenerate them with `node scripts/record-sample.mjs`.

`aarav.png` and `ananya.png` depict fictional people. They were generated with the built-in image generation tool and visually inspected. They are not photographs of real students.

## Aarav prompt

Create a single square natural editorial headshot photograph for a clearly fictional student profile in a sample university project website. A fictional Indian male college student around age 21, short wavy dark hair, clean shaven, relaxed friendly expression, wearing a simple cobalt blue overshirt over a plain cream T-shirt. Head and shoulders, looking toward camera, softly blurred pale warm campus background with greenery, natural daylight, realistic skin texture, professional but approachable student portfolio photo. No text, logos, badges, or watermarks. This is one individual portrait, not a collage.

## Ananya prompt

Create one square natural editorial photographic headshot for a clearly fictional female student profile in a sample university project website. A fictional Indian woman around 21, shoulder length dark hair tucked casually behind one ear, relaxed friendly expression, simple burnt-orange cotton blouse, no branding or university logos. Head and shoulders facing the camera, softly blurred cream campus wall and greenery, warm natural daylight, realistic skin texture, professional yet approachable student portfolio photograph. No text, badges, watermarks, or collage.

## Publishing

Run `npm run db:sample` to publish the example once. Existing examples are preserved. Source files are packaged in `../campusflow-source.zip`; images are decoded and re-encoded before storage. Repository-authored sample assets have an explicit `trusted_sample` provenance, not a malware-scan verdict. This does not bypass scanning for student uploads. The fictional sample account is suspended and passwordless; team email matches cannot edit this example. Stars, likes, and discussions start empty.
