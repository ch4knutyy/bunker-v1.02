# Legacy commit patch inventory

Baseline: `d5c753e0ad44f3f6fd4a0ce92837fa221db69121`.

Generated from complete `git show --format= --no-ext-diff --no-renames <commit>` patches, including empty-root handling. SHA-256 identifies each patch; path presence and exact-blob matches are evidence only, not semantic attribution. Current means the baseline HEAD, before this cleanup. Empty files are excluded from blob-match reporting. See the accompanying cleanup report for relocated and mixed implementations.

## 8ed15548e93b199fe5cb5981c9428b99e46d57f6

emergent-agent-e1 <github@emergent.sh> — Fix missing Personality (Особистість) in GM panel + robust characteristic handling

Patch SHA-256: `499eec35adb43f7d6a2cddc00d8ccc9355403aef2d2db23da547539f96c8ba73`.

| Original path | Added / removed | Same path at HEAD | Identical nonempty blob at HEAD |
| --- | --- | --- | --- |
| `Views/Home/Index.cshtml` | 84 / 38 | present | none |

## 0fb33649bb4316b189d91d0a9e3029de9793781c

emergent-agent-e1 <github@emergent.sh> — Fix 3 GM panel and player table bugs

Patch SHA-256: `13b100780b3ab10296f4cff7f84ef2b60b699898736e37451072c525bceadcc0`.

| Original path | Added / removed | Same path at HEAD | Identical nonempty blob at HEAD |
| --- | --- | --- | --- |
| `GameHub.cs` | 42 / 0 | absent | none |
| `Views/Home/Index.cshtml` | 184 / 26 | present | none |

## 916afe00e6d0607d6ff162a86dae1138148e6db9

emergent-agent-e1 <github@emergent.sh> — Fix 'Запаси' button to add random supplies + Fix voting button visibility

Patch SHA-256: `cede6d338ab8e06ad8f3c0ef0158be9ab5244d20b35a1e4ec7dee3743d68a5e0`.

| Original path | Added / removed | Same path at HEAD | Identical nonempty blob at HEAD |
| --- | --- | --- | --- |
| `GameHub.cs` | 72 / 0 | absent | none |
| `Views/Home/Index.cshtml` | 104 / 1 | present | none |

## c59ee69dec177dd10e57f9882b33f1619455487d

emergent-agent-e1 <github@emergent.sh> — Implement scenario images for Apocalypse and Bunker

Patch SHA-256: `228517b0852b42808e4548a4268b0d9364324a540b5cb2ee1ead2072479537db`.

| Original path | Added / removed | Same path at HEAD | Identical nonempty blob at HEAD |
| --- | --- | --- | --- |
| `Controllers/ScenarioImageController.cs` | 236 / 0 | present | none |
| `GameHub.cs` | 10 / 1 | absent | none |
| `Models/ApocalypseAndBunker.cs` | 34 / 2 | absent | none |
| `Program.cs` | 1 / 1 | present | none |
| `Service/ScenarioImageService.cs` | 255 / 0 | absent | none |
| `Views/Home/Index.cshtml` | 620 / 5 | present | none |

## 06f45eb05b1d723353cfcaae5096cf5906388f1e

emergent-agent-e1 <github@emergent.sh> — Add visual effect for eliminated players in players table

Patch SHA-256: `85ccf30ee36b878d64c4571389b12d89a33007bead5bb94875a73a1d2c18a807`.

| Original path | Added / removed | Same path at HEAD | Identical nonempty blob at HEAD |
| --- | --- | --- | --- |
| `Views/Home/Index.cshtml` | 119 / 4 | present | none |

## bc6b2a7845d46deefc5f325b37ad203c362400ae

emergent-agent-e1 <github@emergent.sh> — Fix host UI visibility and add styled Apocalypse/Bunker header

Patch SHA-256: `4c66ba93df070d552b48208cafa0b2132d6ac871c51470f10db15659e2fb4d08`.

| Original path | Added / removed | Same path at HEAD | Identical nonempty blob at HEAD |
| --- | --- | --- | --- |
| `Views/Home/Index.cshtml` | 95 / 26 | present | none |

## 21f74e9bed7d6c74f92ae5c7bdbf0b8698b3e238

emergent-agent-e1 <github@emergent.sh> — Fix StartGame flow: server-side state check bug and client-side handling

Patch SHA-256: `cb897d5a79f63d2a9db35b6f05f3e6c80bf8c7129d6fb44fcb6792678cb42325`.

| Original path | Added / removed | Same path at HEAD | Identical nonempty blob at HEAD |
| --- | --- | --- | --- |
| `Service/RoomService.cs` | 2 / 2 | absent | none |
| `Views/Home/Index.cshtml` | 134 / 31 | present | none |

## 710bc285cddbeaaa847fe244b0654ad0fb35406a

emergent-agent-e1 <github@emergent.sh> — Fix room UI rendering: normalize player data and fix updateRoomUI bug

Patch SHA-256: `5f68aee73e9601a5348cb995a4b91a0215c55d693252f431e2e81ca1cf342150`.

| Original path | Added / removed | Same path at HEAD | Identical nonempty blob at HEAD |
| --- | --- | --- | --- |
| `Views/Home/Index.cshtml` | 214 / 81 | present | none |

## 897e867deb825882d9cf49c4549bad5032dadef2

emergent-agent-e1 <github@emergent.sh> — auto-commit for 9f3caedb-61ac-4627-a597-4a12518e3b5f

Patch SHA-256: `e745569f18f0123668091d3a152e1dcbf2ac506f46173ad2b1fd24fd25987ff8`.

| Original path | Added / removed | Same path at HEAD | Identical nonempty blob at HEAD |
| --- | --- | --- | --- |
| `.emergent/emergent.yml` | 3 / 0 | absent | none |
| `.gitignore` | 82 / 0 | present | none |
| `README.md` | 1 / 0 | present | none |
| `backend/.env` | 3 / 0 | absent | none |
| `backend/requirements.txt` | 27 / 0 | absent | none |
| `backend/server.py` | 89 / 0 | absent | none |
| `bunker-project` | 1 / 0 | absent | none |
| `frontend/.env` | 3 / 0 | absent | none |
| `frontend/.gitignore` | 23 / 0 | absent | none |
| `frontend/README.md` | 70 / 0 | absent | none |
| `frontend/components.json` | 21 / 0 | absent | none |
| `frontend/craco.config.js` | 100 / 0 | absent | none |
| `frontend/jsconfig.json` | 9 / 0 | absent | none |
| `frontend/package.json` | 91 / 0 | absent | none |
| `frontend/plugins/health-check/health-endpoints.js` | 213 / 0 | absent | none |
| `frontend/plugins/health-check/webpack-health-plugin.js` | 120 / 0 | absent | none |
| `frontend/postcss.config.js` | 6 / 0 | absent | none |
| `frontend/public/index.html` | 158 / 0 | absent | none |
| `frontend/src/App.css` | 34 / 0 | absent | none |
| `frontend/src/App.js` | 54 / 0 | absent | none |
| `frontend/src/components/ui/accordion.jsx` | 41 / 0 | absent | none |
| `frontend/src/components/ui/alert-dialog.jsx` | 97 / 0 | absent | none |
| `frontend/src/components/ui/alert.jsx` | 47 / 0 | absent | none |
| `frontend/src/components/ui/aspect-ratio.jsx` | 5 / 0 | absent | none |
| `frontend/src/components/ui/avatar.jsx` | 33 / 0 | absent | none |
| `frontend/src/components/ui/badge.jsx` | 34 / 0 | absent | none |
| `frontend/src/components/ui/breadcrumb.jsx` | 92 / 0 | absent | none |
| `frontend/src/components/ui/button.jsx` | 48 / 0 | absent | none |
| `frontend/src/components/ui/calendar.jsx` | 71 / 0 | absent | none |
| `frontend/src/components/ui/card.jsx` | 50 / 0 | absent | none |
| `frontend/src/components/ui/carousel.jsx` | 193 / 0 | absent | none |
| `frontend/src/components/ui/checkbox.jsx` | 22 / 0 | absent | none |
| `frontend/src/components/ui/collapsible.jsx` | 9 / 0 | absent | none |
| `frontend/src/components/ui/command.jsx` | 116 / 0 | absent | none |
| `frontend/src/components/ui/context-menu.jsx` | 156 / 0 | absent | none |
| `frontend/src/components/ui/dialog.jsx` | 94 / 0 | absent | none |
| `frontend/src/components/ui/drawer.jsx` | 90 / 0 | absent | none |
| `frontend/src/components/ui/dropdown-menu.jsx` | 156 / 0 | absent | none |
| `frontend/src/components/ui/form.jsx` | 133 / 0 | absent | none |
| `frontend/src/components/ui/hover-card.jsx` | 23 / 0 | absent | none |
| `frontend/src/components/ui/input-otp.jsx` | 53 / 0 | absent | none |
| `frontend/src/components/ui/input.jsx` | 19 / 0 | absent | none |
| `frontend/src/components/ui/label.jsx` | 16 / 0 | absent | none |
| `frontend/src/components/ui/menubar.jsx` | 198 / 0 | absent | none |
| `frontend/src/components/ui/navigation-menu.jsx` | 104 / 0 | absent | none |
| `frontend/src/components/ui/pagination.jsx` | 100 / 0 | absent | none |
| `frontend/src/components/ui/popover.jsx` | 27 / 0 | absent | none |
| `frontend/src/components/ui/progress.jsx` | 21 / 0 | absent | none |
| `frontend/src/components/ui/radio-group.jsx` | 29 / 0 | absent | none |
| `frontend/src/components/ui/resizable.jsx` | 40 / 0 | absent | none |
| `frontend/src/components/ui/scroll-area.jsx` | 38 / 0 | absent | none |
| `frontend/src/components/ui/select.jsx` | 119 / 0 | absent | none |
| `frontend/src/components/ui/separator.jsx` | 23 / 0 | absent | none |
| `frontend/src/components/ui/sheet.jsx` | 108 / 0 | absent | none |
| `frontend/src/components/ui/skeleton.jsx` | 14 / 0 | absent | none |
| `frontend/src/components/ui/slider.jsx` | 21 / 0 | absent | none |
| `frontend/src/components/ui/sonner.jsx` | 28 / 0 | absent | none |
| `frontend/src/components/ui/switch.jsx` | 22 / 0 | absent | none |
| `frontend/src/components/ui/table.jsx` | 86 / 0 | absent | none |
| `frontend/src/components/ui/tabs.jsx` | 41 / 0 | absent | none |
| `frontend/src/components/ui/textarea.jsx` | 18 / 0 | absent | none |
| `frontend/src/components/ui/toast.jsx` | 85 / 0 | absent | none |
| `frontend/src/components/ui/toaster.jsx` | 33 / 0 | absent | none |
| `frontend/src/components/ui/toggle-group.jsx` | 43 / 0 | absent | none |
| `frontend/src/components/ui/toggle.jsx` | 40 / 0 | absent | none |
| `frontend/src/components/ui/tooltip.jsx` | 26 / 0 | absent | none |
| `frontend/src/hooks/use-toast.js` | 155 / 0 | absent | none |
| `frontend/src/index.css` | 115 / 0 | absent | none |
| `frontend/src/index.js` | 11 / 0 | absent | none |
| `frontend/src/lib/utils.js` | 6 / 0 | absent | none |
| `frontend/tailwind.config.js` | 82 / 0 | absent | none |
| `memory/.gitkeep` | 0 / 0 | absent | none |
| `memory/PRD.md` | 77 / 0 | absent | none |
| `test_reports/.gitkeep` | 0 / 0 | absent | none |
| `test_reports/pytest/.gitkeep` | 0 / 0 | absent | none |
| `test_result.md` | 103 / 0 | absent | `docs/archive/test_result.md` |
| `tests/__init__.py` | 0 / 0 | absent | none |

## a353025a467be3b3b960aa3c1b59197e31c613bd

emergent-agent-e1 <github@emergent.sh> — Initial commit

Patch SHA-256: `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855`.

Empty tree/patch; no files introduced.
