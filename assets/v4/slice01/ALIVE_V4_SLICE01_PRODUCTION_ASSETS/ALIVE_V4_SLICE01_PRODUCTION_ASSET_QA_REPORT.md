# ALIVE V4 · SLICE 01 Production Asset QA Report

Expected Assets: 26  
PASS: 26  
FAIL: 0  
Rejected: 0  
Pack Status: **COMPLETE — PENDING USER VISUAL APPROVAL**

## Source and validation

- Primary extraction source: 'ALIVE V4 · SLICE 01 CLEAN CROPPED ASSETS' / 'alive crop.png'
- Validation sources: 'alive 01.png' through 'alive 05.png'
- Every PNG is RGBA with real transparency. The checkerboard is not embedded.
- Source resolution is limited by the supplied clean master sheet; assets are preserved at source-derived resolution without generational upscale.
- Three-background inspection is represented in the contact sheets: checkerboard, cream, and dark.

## Asset QA

| # | Asset | File | Dimensions | Alpha | Padding | Edge | Complete | State | Naming | QA |
|---:|---|---|---:|---|---|---|---|---|---|---|
| 1 | zhanzhan_morning | characters/zhanzhan/zhanzhan_morning.png | 155×202 | YES | YES | PASS | PASS | PASS | PASS | PASS |
| 2 | zhanzhan_neutral | characters/zhanzhan/zhanzhan_neutral.png | 155×202 | YES | YES | PASS | PASS | PASS | PASS | PASS |
| 3 | zhanzhan_tired | characters/zhanzhan/zhanzhan_tired.png | 155×202 | YES | YES | PASS | PASS | PASS | PASS | PASS |
| 4 | zhanzhan_settled | characters/zhanzhan/zhanzhan_settled.png | 155×202 | YES | YES | PASS | PASS | PASS | PASS | PASS |
| 5 | smoke_beast_encounter | characters/smoke-beast/smoke_beast_encounter.png | 144×142 | YES | YES | PASS | PASS | PASS | PASS | PASS |
| 6 | smoke_beast_normal | characters/smoke-beast/smoke_beast_normal.png | 159×157 | YES | YES | PASS | PASS | PASS | PASS | PASS |
| 7 | smoke_beast_eating | characters/smoke-beast/smoke_beast_eating.png | 164×157 | YES | YES | PASS | PASS | PASS | PASS | PASS |
| 8 | smoke_beast_full | characters/smoke-beast/smoke_beast_full.png | 163×157 | YES | YES | PASS | PASS | PASS | PASS | PASS |
| 9 | room_bed | room/room_bed.png | 198×126 | YES | YES | PASS | PASS | PASS | PASS | PASS |
| 10 | room_table | room/room_table.png | 166×126 | YES | YES | PASS | PASS | PASS | PASS | PASS |
| 11 | room_stool | room/room_stool.png | 120×126 | YES | YES | PASS | PASS | PASS | PASS | PASS |
| 12 | room_window | room/room_window.png | 155×140 | YES | YES | PASS | PASS | PASS | PASS | PASS |
| 13 | room_lamp | room/room_lamp.png | 118×130 | YES | YES | PASS | PASS | PASS | PASS | PASS |
| 14 | room_cup | room/room_cup.png | 132×126 | YES | YES | PASS | PASS | PASS | PASS | PASS |
| 15 | room_rug | room/room_rug.png | 226×120 | YES | YES | PASS | PASS | PASS | PASS | PASS |
| 16 | room_slippers | room/room_slippers.png | 163×130 | YES | YES | PASS | PASS | PASS | PASS | PASS |
| 17 | egg_still | world/egg_still.png | 154×126 | YES | YES | PASS | PASS | PASS | PASS | PASS |
| 18 | plant_stage_a | world/plant_stage_a.png | 128×136 | YES | YES | PASS | PASS | PASS | PASS | PASS |
| 19 | plant_stage_b | world/plant_stage_b.png | 132×140 | YES | YES | PASS | PASS | PASS | PASS | PASS |
| 20 | window_early | world/window_early.png | 172×136 | YES | YES | PASS | PASS | PASS | PASS | PASS |
| 21 | ui_tape_yellow | ui/ui_tape_yellow.png | 116×83 | YES | YES | PASS | PASS | PASS | PASS | PASS |
| 22 | ui_tape_red | ui/ui_tape_red.png | 116×83 | YES | YES | PASS | PASS | PASS | PASS | PASS |
| 23 | ui_note_paper | ui/ui_note_paper.png | 112×100 | YES | YES | PASS | PASS | PASS | PASS | PASS |
| 24 | ui_speech_bubble | ui/ui_speech_bubble.png | 138×100 | YES | YES | PASS | PASS | PASS | PASS | PASS |
| 25 | ui_heart | ui/ui_heart.png | 112×101 | YES | YES | PASS | PASS | PASS | PASS | PASS |
| 26 | ui_smoke_icon | ui/ui_smoke_icon.png | 95×105 | YES | YES | PASS | PASS | PASS | PASS | PASS |

## Rejected assets

None. All 26 requested files are present in the production candidate directory.

## Automatic checks

- Exact count: 26 / 26.
- PNG alpha channel: present for all assets.
- SHA-256: recorded in 'asset-manifest.json'.
- No duplicate filename or missing required slot.
- Empty reusable paper and speech bubble contain no sample copy.
- 'room_window.png' and 'window_early.png' remain separate assets.

## Approval gate

This is a production candidate pack, not final approval. Website integration remains unauthorized until the user visually approves the contact sheets and scale test.
