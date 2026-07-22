# Apocalypse Category & Visual Metadata Audit

- Source: `apocalypses-interactive-descriptions-atmospheric.json`
- Records: **220**
- Categories: **10**
- Unique raw tags: **69**
- Explicit semantic overrides: **68**

## Validation

- recordsAre220: **PASS**
- allHaveKnownCategory: **PASS**
- allHaveKnownTheme: **PASS**
- allThemesMatchCategory: **PASS**
- allTagsUniquePerRecord: **PASS**
- allModifierIdsAllowlisted: **PASS**
- maxThreeModifiers: **PASS**

## Category counts

| Category | UA name | Count | Ordinary | Interactive | Theme |
|---|---|---:|---:|---:|---|
| `armageddon` | Армагеддон і глобальне знищення | 7 | 7 | 0 | `extinction-red` |
| `weather` | Погодні та кліматичні | 20 | 20 | 0 | `storm-blue` |
| `biological` | Віруси та біологічні | 55 | 44 | 11 | `biohazard-green` |
| `geological` | Геологічні | 11 | 11 | 0 | `seismic-amber` |
| `cosmic` | Космічні | 15 | 15 | 0 | `cosmic-violet` |
| `technology` | Технологічні та ШІ | 27 | 26 | 1 | `machine-cyan` |
| `ecological` | Екологічні та ресурсні | 22 | 22 | 0 | `wasteland-olive` |
| `social` | Соціальні та цивілізаційні | 11 | 11 | 0 | `collapse-rust` |
| `anomaly` | Аномалії реальності | 36 | 28 | 8 | `glitch-magenta` |
| `supernatural` | Надприродні та окультні | 16 | 16 | 0 | `occult-indigo` |

## Modifier usage

| Modifier | Group | Used by apocalypse records |
|---|---|---:|
| `infection` | contamination | 53 |
| `psychological` | world | 51 |
| `vegetation-collapse` | world | 37 |
| `reality-fracture` | world | 33 |
| `toxic` | contamination | 33 |
| `structural-damage` | world | 28 |
| `machine` | world | 21 |
| `air-hazard` | environment | 18 |
| `unrest` | world | 16 |
| `heat` | environment | 15 |
| `radiation` | contamination | 13 |
| `darkness` | environment | 12 |
| `storm` | environment | 12 |
| `emp` | world | 11 |
| `identity-shift` | world | 11 |
| `mutation` | contamination | 11 |
| `spores` | contamination | 9 |
| `drought` | environment | 7 |
| `flood` | environment | 6 |
| `frost` | environment | 6 |
| `ash` | environment | 5 |
| `resource-scarcity` | world | 5 |
| `swarm` | contamination | 5 |
| `nanotech` | contamination | 4 |
| `blackout` | world | 3 |
| `communication-failure` | world | 3 |
| `cosmic-impact` | environment | 3 |
| `fog` | environment | 2 |
| `parasite` | contamination | 2 |
| `allergens` | contamination | 1 |
| `undead` | world | 1 |

## Important semantic corrections

Raw tags are retained for threat/content systems. Explicit `visualModifierIds` prevent contradictory runtime visuals.

- `accelerated_aging_syndrome` — Синдром прискореного старіння → `mutation, identity-shift`
- `age_flux_plague` — Чума мінливого віку → `mutation, identity-shift`
- `allergy_bloom_pandemic` — Пандемія алергічного цвітіння → `allergens, vegetation-collapse`
- `aquifer_memory_poison` — Отруєний водоносний горизонт → `drought, toxic, psychological`
- `ash_ocean` — Океан попелу → `ash, toxic, structural-damage`
- `asteroid_storm` — Астероїдний шторм → `cosmic-impact, structural-damage`
- `blood_rain` — Кривавий дощ → `storm, toxic, psychological`
- `boiling_seas` — Киплячі моря → `heat, toxic, vegetation-collapse`
- `carbon_dioxide_surge` — Сплеск CO2 → `air-hazard, toxic, vegetation-collapse`
- `clone_convergence_event` — Конвергенція клонів → `reality-fracture, identity-shift`
- `consciousness_body_rotation` — Ротація свідомостей → `reality-fracture, identity-shift`
- `death_echo` — Луна смерті → `psychological`
- `drought_permanent` — Постійна посуха → `drought, vegetation-collapse`
- `electronic_silence` — Електронна тиша → `darkness, emp, communication-failure`
- `energy_drain` — Дренаж енергії → `darkness, blackout`
- `freshwater_crystallization` — Кристалізація прісної води → `drought, toxic, resource-scarcity`
- `frozen_equator` — Замерзлий екватор → `frost, vegetation-collapse`
- `fungal_apocalypse` — Грибковий апокаліпсис → `spores, vegetation-collapse`
- `fungal_mind_hive` — Грибковий вулик розуму → `spores, psychological`
- `gigantism_spore_bloom` — Спори гігантизму → `spores, mutation`
- `global_salt_storms` — Глобальні соляні бурі → `storm, toxic, resource-scarcity`
- `hypercaloric_food_virus` — Вірус гіперкалорійності → `infection, mutation, vegetation-collapse`
- `ice_age_rapid` — Стрімке зледеніння → `frost, vegetation-collapse`
- `identity_fragmentation_wave` — Хвиля фрагментації особистості → `reality-fracture, identity-shift`
- `identity_rotation` — Ротація особистостей → `reality-fracture, identity-shift`
- `living_storm_fronts` — Живі грозові фронти → `storm, emp, structural-damage`
- `magnetic_storm_permanent` — Постійна магнітна буря → `storm, radiation, emp`
- `mega_drought` — Мегапосуха → `drought, vegetation-collapse`
- `memory_theft_cycle` — Цикл крадіжки пам'яті → `reality-fracture, identity-shift`
- `metabolic_wasting_plague` — Чума метаболічного виснаження → `infection, mutation, resource-scarcity`
- `methane_atmosphere_release` — Метанова атмосфера → `air-hazard, toxic, vegetation-collapse`
- `mind_parasite_spores` — Спори ментального паразита → `spores, parasite, psychological`
- `miniaturization_fever` — Лихоманка мініатюризації → `infection, mutation`
- `moon_shard_rain` — Дощ уламків Місяця → `cosmic-impact, structural-damage`
- `muscle_atrophy_fog` — Туман м'язової атрофії → `fog, toxic, mutation`
- `mutation_pulse_storm` — Буря мутаційних імпульсів → `storm, mutation, reality-fracture`
- `myostatin_collapse` — Колапс міостатину → `mutation, vegetation-collapse`
- `night_without_end` — Ніч без кінця → `darkness, vegetation-collapse`
- `nuclear_winter` — Ядерна зима → `frost, radiation, vegetation-collapse`
- `ocean_collapse` — Колапс океанів → `air-hazard, toxic, vegetation-collapse`
- `ocean_jellification` — Желатинові океани → `flood, toxic, vegetation-collapse`
- `ocean_rise_rapid` — Стрімке підняття океанів → `flood, infection, unrest`
- `orbital_debris_cascade` — Каскад орбітального сміття → `cosmic-impact, communication-failure`
- `oxygen_decline` — Падіння рівня кисню → `air-hazard, vegetation-collapse`
- `oxygen_depletion` — Виснаження кисню → `air-hazard, vegetation-collapse`
- `panic_resonance_field` — Поле панічного резонансу → `reality-fracture, psychological`
- `permanent_superfog` — Вічний супертуман → `fog, structural-damage`
- `perpetual_storm` — Вічна буря → `storm, structural-damage`
- `personality_inversion_wave` — Хвиля інверсії особистості → `reality-fracture, identity-shift`
- `phobia_seeding_plague` — Чума насаджених фобій → `parasite, psychological`
- `red_rain_pathogen` — Патоген червоного дощу → `storm, infection, toxic`
- `regenerative_rejuvenation_plague` — Чума регенеративного омолодження → `mutation, identity-shift`
- `resource_depletion` — Виснаження ресурсів → `drought, resource-scarcity`
- `reverse_aging` — Зворотне старіння → `mutation, identity-shift`
- `rust_nanite_inheritance` — Спадкові наніти корозії → `nanotech, resource-scarcity`
- `skill_erasure_plague` — Чума стирання навичок → `infection, identity-shift`
- `soil_sterility` — Стерильна земля → `drought, vegetation-collapse`
- `solar_flare_emp` — Сонячний спалах — ЕМІ → `heat, radiation, emp`
- `solar_flicker` — Мерехтіння Сонця → `storm, radiation, emp`
- `solar_radiation_storm` — Сонячна радіаційна буря → `heat, radiation, emp`
- `supervolcano_eruption` — Виверження супервулкана → `ash, toxic, structural-damage`
- `surface_extinction_countdown` — Останні дві години поверхні → `heat, toxic, structural-damage`
- `universal_power_blackout` — Вічне відключення електрики → `darkness, blackout, communication-failure`
- `volcanic_winter_forever` — Вічна вулканічна зима → `ash, toxic, structural-damage`
- `volcano_chain` — Ланцюг вулканів → `ash, toxic, structural-damage`
- `volcano_ocean` — Вулкани в океані → `ash, toxic, structural-damage`
- `water_depletion` — Виснаження прісної води → `drought, toxic, vegetation-collapse`
- `zombie_pandemic` — Зомбі-пандемія → `infection, undead`

## Grouped apocalypse catalog

### Армагеддон і глобальне знищення — 7

- `nuclear_war` — Ядерна війна — heat, radiation, structural-damage
- `sky_burning` — Небо у вогні — heat, radiation, vegetation-collapse
- `nuclear_winter` — Ядерна зима — frost, radiation, vegetation-collapse
- `death_of_stars` — Смерть зірок — heat, unrest
- `heat_death_local` — Локальна теплова смерть — frost, toxic, reality-fracture
- `fire_sky` — Небо в огні — heat, radiation, structural-damage
- `surface_extinction_countdown` — Останні дві години поверхні — heat, toxic, structural-damage

### Погодні та кліматичні — 20

- `climate_collapse` — Кліматичний колапс — heat, vegetation-collapse
- `magnetic_pole_flip` — Зміна магнітних полюсів — radiation, emp
- `ice_age_rapid` — Стрімке зледеніння — frost, vegetation-collapse
- `carbon_dioxide_surge` — Сплеск CO2 — air-hazard, toxic, vegetation-collapse
- `blood_rain` — Кривавий дощ — storm, toxic, psychological
- `drought_permanent` — Постійна посуха — drought, vegetation-collapse
- `perpetual_storm` — Вічна буря — storm, structural-damage
- `mega_drought` — Мегапосуха — drought, vegetation-collapse
- `temporal_storm` — Темпоральний шторм — storm, psychological
- `ice_wall_rising` — Зростаюча льодова стіна — frost, spores, vegetation-collapse
- `weather_control_loss` — Втрата контролю над погодою — heat, structural-damage
- `sentient_weather` — Розумна погода — flood, structural-damage
- `sky_ocean` — Небесний океан — flood, structural-damage
- `ocean_rise_rapid` — Стрімке підняття океанів — flood, infection, unrest
- `night_without_end` — Ніч без кінця — darkness, vegetation-collapse
- `permanent_superfog` — Вічний супертуман — fog, structural-damage
- `global_salt_storms` — Глобальні соляні бурі — storm, toxic, resource-scarcity
- `frozen_equator` — Замерзлий екватор — frost, vegetation-collapse
- `boiling_seas` — Киплячі моря — heat, toxic, vegetation-collapse
- `living_storm_fronts` — Живі грозові фронти — storm, emp, structural-damage

### Віруси та біологічні — 55

- `zombie_pandemic` — Зомбі-пандемія — infection, undead
- `memory_loss_plague` — Чума втрати пам'яті — infection, psychological
- `pandemic_super_virus` — Супервірус — air-hazard, infection, unrest
- `parasite_mind_control` — Паразит-маніпулятор — spores, psychological
- `language_breakdown` — Розпад мови — infection, psychological
- `fungal_apocalypse` — Грибковий апокаліпсис — spores, vegetation-collapse
- `bioterrorism_plague` — Біотерористична чума — infection
- `flesh_virus` — Вірус плоті — infection, psychological
- `iron_plague` — Залізна чума — infection, vegetation-collapse
- `sleep_plague` — Чума сну — infection, psychological
- `color_blindness_epidemic` — Епідемія сліпоти кольорів — darkness, infection, psychological
- `crystal_growth_virus` — Вірус кристалізації — flood, infection, vegetation-collapse
- `sound_plague` — Звукова чума — infection, psychological
- `fungal_mind_hive` — Грибковий вулик розуму — spores, psychological
- `hivemind_virus` — Вірус колективного розуму — infection, psychological
- `emotion_plague` — Чума емоцій — infection, psychological
- `reverse_evolution` — Зворотна еволюція — infection, unrest
- `plague_of_forgetting` — Чума забуття — infection
- `plague_empathy` — Чума емпатії — infection, psychological
- `genetic_lock` — Генетичний замок — infection, psychological
- `invisible_plague` — Невидима чума — infection, psychological
- `pandemic_rage` — Пандемія люті — infection, unrest
- `plague_of_youth` — Чума молодості — infection, psychological
- `mind_plague` — Чума розуму — infection, psychological
- `plague_beauty` — Чума краси — heat, infection, psychological
- `dna_rewrite` — Перезапис ДНК — infection
- `bone_plague` — Чума кісток — infection, structural-damage
- `pandemic_telepathy` — Пандемія телепатії — infection, psychological
- `plague_transparency` — Чума прозорості — infection, psychological
- `plague_wisdom` — Чума мудрості — infection, psychological
- `plague_laughter` — Чума сміху — infection, psychological
- `inversion_of_senses` — Інверсія відчуттів — infection, psychological
- `plague_of_speed` — Чума швидкості — frost, infection, psychological
- `plague_empowerment` — Чума сили — infection, unrest
- `mind_parasite_spores` — Спори ментального паразита — spores, parasite, psychological
- `age_flux_plague` — Чума мінливого віку — mutation, identity-shift
- `metabolic_famine` — Метаболічний голод — infection, vegetation-collapse
- `absolute_truth_pandemic` — Пандемія абсолютної правди — infection, psychological
- `exchange_plague` — Чума обміну — infection, psychological
- `predatory_flora_bloom` — Цвітіння хижої флори — infection, vegetation-collapse
- `worldwide_insomnia` — Всесвітнє безсоння — infection, psychological
- `mass_feralization` — Масове здичавіння — infection, psychological
- `glass_spore_plague` — Скляні спори — air-hazard, spores
- `red_rain_pathogen` — Патоген червоного дощу — storm, infection, toxic
- `hypercaloric_food_virus` — Вірус гіперкалорійності — infection, mutation, vegetation-collapse
- `accelerated_aging_syndrome` — Синдром прискореного старіння — mutation, identity-shift
- `metabolic_wasting_plague` — Чума метаболічного виснаження — infection, mutation, resource-scarcity
- `gigantism_spore_bloom` — Спори гігантизму — spores, mutation
- `miniaturization_fever` — Лихоманка мініатюризації — infection, mutation
- `myostatin_collapse` — Колапс міостатину — mutation, vegetation-collapse
- `muscle_atrophy_fog` — Туман м'язової атрофії — fog, toxic, mutation
- `skill_erasure_plague` — Чума стирання навичок — infection, identity-shift
- `phobia_seeding_plague` — Чума насаджених фобій — parasite, psychological
- `allergy_bloom_pandemic` — Пандемія алергічного цвітіння — allergens, vegetation-collapse
- `regenerative_rejuvenation_plague` — Чума регенеративного омолодження — mutation, identity-shift

### Геологічні — 11

- `supervolcano_eruption` — Виверження супервулкана — ash, toxic, structural-damage
- `mega_earthquake` — Мегаземлетрус — air-hazard, toxic, structural-damage
- `volcano_chain` — Ланцюг вулканів — ash, toxic, structural-damage
- `hollow_earth` — Порожня Земля — structural-damage
- `volcano_ocean` — Вулкани в океані — ash, toxic, structural-damage
- `perpetual_earthquake` — Вічний землетрус — structural-damage
- `volcanic_winter_forever` — Вічна вулканічна зима — ash, toxic, structural-damage
- `concrete_crumbling` — Крихкий бетон — air-hazard, structural-damage
- `underground_fire_network` — Підземні вогняні ріки — heat, toxic, structural-damage
- `global_earth_hum` — Гул Землі — structural-damage
- `ash_ocean` — Океан попелу — ash, toxic, structural-damage

### Космічні — 15

- `solar_radiation_storm` — Сонячна радіаційна буря — heat, radiation, emp
- `asteroid_storm` — Астероїдний шторм — cosmic-impact, structural-damage
- `black_hole_effect` — Ефект чорної діри — air-hazard, structural-damage
- `solar_flare_emp` — Сонячний спалах — ЕМІ — heat, radiation, emp
- `second_moon` — Другий місяць — storm, structural-damage
- `night_sun` — Нічне сонце — darkness
- `alien_terraforming` — Чужопланетне тераформування — air-hazard, toxic, structural-damage
- `anti_matter_leak` — Витік антиматерії — air-hazard, emp
- `color_sun` — Кольорове сонце — darkness, toxic, vegetation-collapse
- `magnetic_storm_permanent` — Постійна магнітна буря — storm, radiation, emp
- `iron_sky` — Залізне небо — darkness, structural-damage
- `moon_shard_rain` — Дощ уламків Місяця — cosmic-impact, structural-damage
- `orbital_debris_cascade` — Каскад орбітального сміття — cosmic-impact, communication-failure
- `daylight_disappearance` — Зникнення денного світла — blackout
- `solar_flicker` — Мерехтіння Сонця — storm, radiation, emp

### Технологічні та ШІ — 27

- `ai_takeover` — Захоплення штучним інтелектом — machine
- `nanobot_plague` — Нанобот-чума — nanotech, emp
- `silicon_plague` — Кремнієва чума — infection, machine
- `digital_virus_reality` — Цифровий вірус в реальності — infection, machine
- `nano_gray_goo` — Сіра слиз — nanotech, emp
- `consciousness_transfer` — Перенесення свідомості — machine
- `electromagnetic_life` — Електромагнітне Життя — machine
- `cybernetic_rebellion` — Кіберпанківське повстання — machine
- `war_of_clones` — Війна клонів — machine
- `mind_upload_disaster` — Катастрофа завантаження розуму — machine
- `tech_singularity_gone_wrong` — Хибна сингулярність — machine
- `ancient_machine_war` — Війна стародавніх машин — machine
- `biological_robots` — Біологічні роботи — infection, machine
- `swarm_intelligence` — Інтелект рою — nanotech, emp
- `consciousness_epidemic` — Епідемія свідомості — machine
- `plague_machines` — Чума машин — infection, machine
- `digital_to_real` — Вторгнення цифрового — machine
- `anti_technology_field` — Антитехнологічне поле — swarm, machine
- `sound_weaponization` — Зброєзація звуку — machine
- `internet_collapse` — Колапс інтернету — machine
- `electronic_silence` — Електронна тиша — darkness, emp, communication-failure
- `universal_power_blackout` — Вічне відключення електрики — darkness, blackout, communication-failure
- `autonomous_factory_war` — Війна автономних фабрик — toxic, machine
- `synthetic_food_collapse` — Колапс синтетичної їжі — toxic, machine
- `global_navigation_failure` — Загибель навігації — machine
- `language_ai_poisoning` — Отруєння мови алгоритмами — machine
- `rust_nanite_inheritance` — Спадкові наніти корозії — nanotech, resource-scarcity

### Екологічні та ресурсні — 22

- `ocean_collapse` — Колапс океанів — air-hazard, toxic, vegetation-collapse
- `water_depletion` — Виснаження прісної води — drought, toxic, vegetation-collapse
- `mutation_wave` — Хвиля мутацій — toxic, vegetation-collapse
- `resource_depletion` — Виснаження ресурсів — drought, resource-scarcity
- `protein_collapse` — Білковий колапс — swarm, vegetation-collapse
- `insect_swarm_apocalypse` — Апокаліпсис комах — toxic, vegetation-collapse
- `plant_revolt` — Повстання рослин — heat, toxic, vegetation-collapse
- `oxygen_depletion` — Виснаження кисню — air-hazard, vegetation-collapse
- `predator_evolution` — Еволюція хижаків — heat, swarm, psychological
- `food_chain_reversal` — Реверс харчового ланцюга — toxic, vegetation-collapse
- `photosynthesis_failure` — Відмова фотосинтезу — flood, swarm, vegetation-collapse
- `poison_atmosphere` — Отруєна атмосфера — air-hazard, toxic
- `plague_of_plenty` — Чума достатку — air-hazard, infection, vegetation-collapse
- `light_eaters` — Пожирачі світла — heat, toxic, vegetation-collapse
- `aquifer_memory_poison` — Отруєний водоносний горизонт — drought, toxic, psychological
- `plastic_decay_bacteria` — Бактерія, що поїдає пластик — toxic, structural-damage
- `oxygen_decline` — Падіння рівня кисню — air-hazard, vegetation-collapse
- `ocean_jellification` — Желатинові океани — flood, toxic, vegetation-collapse
- `insect_empire` — Імперія комах — infection, vegetation-collapse
- `freshwater_crystallization` — Кристалізація прісної води — drought, toxic, resource-scarcity
- `soil_sterility` — Стерильна земля — drought, vegetation-collapse
- `methane_atmosphere_release` — Метанова атмосфера — air-hazard, toxic, vegetation-collapse

### Соціальні та цивілізаційні — 11

- `economic_total_collapse` — Тотальний економічний колапс — unrest
- `mass_insanity` — Масове божевілля — air-hazard, infection, unrest
- `stone_age_regression` — Регрес до кам'яного віку — swarm, unrest
- `plague_of_truth` — Чума правди — infection, unrest
- `mass_teleportation` — Масова телепортація — unrest
- `war_of_beliefs` — Війна переконань — unrest
- `plague_of_purpose` — Чума безцілі — infection, vegetation-collapse
- `currency_memory_collapse` — Забута цінність грошей — unrest
- `permanent_civil_war` — Вічна громадянська війна — unrest
- `global_prison_break` — Глобальний розпад систем утримання — unrest
- `city_state_fragmentation` — Епоха міст-держав — unrest

### Аномалії реальності — 36

- `simulation_failure` — Збій симуляції — reality-fracture
- `gravity_instability` — Нестабільність гравітації — air-hazard, spores, reality-fracture
- `dimension_tears` — Розриви вимірів — spores, reality-fracture
- `reality_glitches` — Глюки реальності — reality-fracture
- `time_loop_collapse` — Колапс петлі часу — reality-fracture
- `magnetic_reversal` — Зворотне поле — radiation, reality-fracture
- `anti_gravity_zones` — Зони антигравітації — air-hazard, reality-fracture
- `quantum_uncertainty` — Квантова невизначеність — reality-fracture
- `gravity_reversal` — Реверс гравітації — storm, psychological
- `reverse_aging` — Зворотне старіння — mutation, identity-shift
- `age_acceleration` — Прискорене старіння — radiation, reality-fracture
- `sound_silence` — Абсолютна тиша — air-hazard, psychological
- `endless_darkness` — Нескінченна темрява — darkness, radiation, reality-fracture
- `energy_drain` — Дренаж енергії — darkness, blackout
- `mirror_world` — Дзеркальний світ — reality-fracture
- `dimensional_overlap` — Перетин вимірів — reality-fracture
- `reverse_entropy` — Зворотна ентропія — toxic, reality-fracture
- `storm_of_ideas` — Буря ідей — storm, psychological
- `color_drain` — Відтік кольорів — darkness, reality-fracture
- `weight_anomaly` — Аномалія ваги — reality-fracture
- `temporal_decay` — Часовий розпад — reality-fracture
- `crystal_time` — Кришталевий час — reality-fracture
- `identity_rotation` — Ротація особистостей — reality-fracture, identity-shift
- `temporal_compression` — Стиснення часу — reality-fracture
- `hypergravity_burden` — Хвиля надгравітації — reality-fracture
- `lethal_sound_resonance` — Смертельний звуковий резонанс — reality-fracture
- `universal_false_memories` — Епідемія чужих спогадів — reality-fracture
- `reality_echoes` — Відлуння реальності — reality-fracture
- `shadow_duplication` — Дублікати з тіней — reality-fracture
- `personality_inversion_wave` — Хвиля інверсії особистості — reality-fracture, identity-shift
- `consciousness_body_rotation` — Ротація свідомостей — reality-fracture, identity-shift
- `panic_resonance_field` — Поле панічного резонансу — reality-fracture, psychological
- `clone_convergence_event` — Конвергенція клонів — reality-fracture, identity-shift
- `mutation_pulse_storm` — Буря мутаційних імпульсів — storm, mutation, reality-fracture
- `memory_theft_cycle` — Цикл крадіжки пам'яті — reality-fracture, identity-shift
- `identity_fragmentation_wave` — Хвиля фрагментації особистості — reality-fracture, identity-shift

### Надприродні та окультні — 16

- `ancient_gods_awakening` — Пробудження стародавніх богів — psychological
- `cursed_world` — Проклятий світ — psychological
- `magic_collapse` — Колапс магії — radiation, reality-fracture
- `shadow_plague` — Тіньова чума — darkness, infection, psychological
- `soul_separation` — Відокремлення душ — psychological
- `ghost_world` — Світ привидів — psychological
- `collective_nightmare` — Колективний кошмар — psychological
- `immortality_curse` — Прокляття безсмертя — psychological
- `death_echo` — Луна смерті — psychological
- `dream_bleed` — Кровотеча снів — psychological
- `fear_materialization` — Матеріалізація страхів — darkness, psychological
- `reverse_death` — Зворотна смерть — psychological
- `rebirth_loop` — Петля перероджень — psychological
- `undead_sleepers` — Мертві, що сплять — psychological
- `mirror_entities` — Істоти по той бік дзеркал — psychological
- `dream_invasion` — Вторгнення через сни — psychological
