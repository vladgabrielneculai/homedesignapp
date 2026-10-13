# Asset credits

The realistic furniture models in `public/models/` come from the
[Khronos glTF Sample Assets](https://github.com/KhronosGroup/glTF-Sample-Assets) repository.
Their textures were downscaled to at most 1024 px (and opaque textures re-encoded as JPEG) to keep the app light.
No other changes were made.

| File | Original model | Copyright | License |
| --- | --- | --- | --- |
| `GlamVelvetSofa.glb` | [GlamVelvetSofa](https://github.com/KhronosGroup/glTF-Sample-Assets/tree/main/Models/GlamVelvetSofa) | © 2021 Wayfair, LLC | [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) |
| `ChairDamaskPurplegold.glb` | [ChairDamaskPurplegold](https://github.com/KhronosGroup/glTF-Sample-Assets/tree/main/Models/ChairDamaskPurplegold) | © 2021 Wayfair | [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) |
| `SheenChair.glb` | [SheenChair](https://github.com/KhronosGroup/glTF-Sample-Assets/tree/main/Models/SheenChair) | © 2020 Wayfair, LLC | [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/) |
| `IridescenceLamp.glb` | [IridescenceLamp](https://github.com/KhronosGroup/glTF-Sample-Assets/tree/main/Models/IridescenceLamp) | © 2022 Wayfair, LLC | [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) |
| `DiffuseTransmissionPlant.glb` | [DiffuseTransmissionPlant](https://github.com/KhronosGroup/glTF-Sample-Assets/tree/main/Models/DiffuseTransmissionPlant) | © 2024 Darmstadt Graphics Group GmbH | [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) |
| `GlassVaseFlowers.glb` | [GlassVaseFlowers](https://github.com/KhronosGroup/glTF-Sample-Assets/tree/main/Models/GlassVaseFlowers) | Public domain | [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/) |

All other furniture, floor textures and the floor-plan symbols are generated in code (`src/three/Procedural.tsx`,
`src/three/textures.ts`, `src/components/PlanSymbol.tsx`) and are part of this project.
