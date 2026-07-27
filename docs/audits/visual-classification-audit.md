# Visual classification audit

## Scope

- Bunkers analyzed: **205**
- Apocalypses analyzed: **220**
- Bunker visual categories: **26**
- Apocalypse realistic visual archetypes: **36**
- Existing apocalypse canonical categories preserved: **10**

## Main architectural decision

The canonical apocalypse category remains a content/filtering category. A new realistic visual archetype is used for physical presentation. This prevents a broad category such as biological or technological from painting the entire interface green or cyan.

For bunkers, the primary visual category describes architecture and material language. Condition, cleanliness, technology level, and visual modifiers describe state without replacing the base architecture.

## Bunker category counts

- `scientific_laboratory` — Науково-лабораторний: 19
- `agricultural_food` — Аграрний та харчовий: 15
- `maritime_underwater` — Морський та підводний: 13
- `military_command` — Військовий командний: 12
- `civic_public` — Громадський та комерційний: 12
- `energy_infrastructure` — Енергетична інфраструктура: 12
- `natural_cavern` — Природний печерний: 11
- `transit_infrastructure` — Транспортна інфраструктура: 10
- `digital_control` — Цифровий та керувальний: 10
- `civil_defense` — Цивільна оборона: 9
- `water_sanitation` — Водна та санітарна інфраструктура: 8
- `luxury_hospitality` — Елітний та готельний: 7
- `religious_ritual` — Релігійний та ритуальний: 7
- `archive_cultural` — Архівний та культурний: 7
- `industrial_production` — Важкий промисловий: 7
- `polar_cryogenic` — Полярний та кріогенний: 7
- `government_security` — Урядовий та безпековий: 7
- `medical_clinical` — Медичний та клінічний: 5
- `abandoned_damaged` — Покинутий та пошкоджений: 5
- `mining_extraction` — Шахтний та видобувний: 4
- `contaminated_isolation` — Карантинний та заражений: 4
- `historic_fortified` — Історичний укріплений: 4
- `fortified_vault` — Броньоване сховище: 3
- `detention` — Тюремний: 3
- `community_improvised` — Імпровізований громадський: 3
- `subterranean_urban` — Підземне місто: 1

## Apocalypse realistic archetype counts

- `cognitive_epidemic` — Когнітивна та психічна епідемія: 21
- `identity_distortion` — Порушення ідентичності: 18
- `mutation_body` — Мутації та тілесні зміни: 16
- `machine_uprising` — Повстання машин: 10
- `reality_fracture` — Розлом реальності: 10
- `blackout_emp` — ЕМІ та відключення енергії: 10
- `fire_ash` — Вогонь, попіл і сажа: 9
- `sensory_resonance` — Сенсорний та звуковий розлад: 9
- `shadow_haunting` — Тіні, привиди та сни: 8
- `resource_scarcity` — Дефіцит ресурсів: 7
- `toxic_air` — Отруєне повітря: 7
- `gravity_distortion` — Гравітаційна деформація: 6
- `fungal_spore` — Спори та грибкове зараження: 6
- `temporal_distortion` — Часова деформація: 6
- `darkness_light_loss` — Зникнення світла: 6
- `storm_electric` — Буря та електрична нестабільність: 6
- `occult_manifestation` — Окультний прояв: 5
- `celestial_anomaly` — Небесна або космічна аномалія: 5
- `overgrowth_swarm` — Рої та неконтрольоване розростання: 5
- `nanotech_corrosion` — Нанотехнологічний розпад: 4
- `extreme_heat` — Спека та висушення: 4
- `civil_collapse` — Цивілізаційний розпад: 4
- `ecological_collapse` — Колапс екосистем: 4
- `seismic_ruin` — Сейсмічне та конструктивне руйнування: 4
- `undead` — Нежить: 3
- `infection_quarantine` — Зараження та карантин: 3
- `cosmic_impact` — Космічні удари та уламки: 3
- `frost_ice` — Мороз і зледеніння: 3
- `corrosive_decay` — Корозійний розпад матеріалів: 3
- `digital_failure` — Цифровий та системний збій: 3
- `flood_moisture` — Затоплення та волога: 3
- `war_unrest` — Війна та масові заворушення: 3
- `fallout_radiation` — Ядерні опади та радіація: 2
- `parasite_infestation` — Паразитарне зараження: 2
- `cosmic_radiation` — Космічна радіація: 1
- `fog_low_visibility` — Туман і низька видимість: 1

## Important examples

- `hospital_bunker` → `medical_clinical` / `ceramic-composite-steel` / modifiers: none
- `shipyard_bunker` → `maritime_underwater` / `marine-steel` / modifiers: damp, corroded, isolated
- `underground_city` → `subterranean_urban` / `reinforced-concrete-industrial-metal` / modifiers: monumental
- `luxury_bunker` → `luxury_hospitality` / `dark-wood-leather-brass` / modifiers: damp, refined
- `plague_hospital_bunker` → `contaminated_isolation` / `sealed-steel-composite` / modifiers: contaminated, biological-hazard

- `iron_plague` → `corrosive_decay` / effects: corrosion, pitting, material-decay
- `anti_matter_leak` → `celestial_anomaly` / effects: unusual-light, deep-shadow, optical-distortion
- `pandemic_super_virus` → `infection_quarantine` / effects: quarantine-markings, sealed-zones, filter-contamination
- `nuclear_war` → `fallout_radiation` / effects: dust, radiation-warning, decontamination-stains, emergency-amber
- `endless_darkness` → `darkness_light_loss` / effects: deep-shadow, emergency-light, screen-light
- `consciousness_epidemic` → `machine_uprising` / effects: locked-controls, hostile-status, cold-machine-light, local-glitch

## Runtime recommendation

Do not select CSS from localized names. Use bunker `id` → bunker classification registry and apocalypse `id` → realistic visual classification registry. The stable variation field can choose deterministic decorative variants without changing after refresh.

## Next stage

Create the Codex implementation prompt using these two registries as the authoritative classification source. The prompt should require a neutral UI foundation, bunker material layer, apocalypse environmental layer, restrained effects, and regression tests across contrasting combinations.