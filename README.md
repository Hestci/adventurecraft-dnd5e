# AdventureCraft DnD5e (bridge)

**Мост D&D 5e** для [AdventureCraft Core](https://github.com/Hestci/adventurecraft-core): редактор рецептов, критический успех, объединение предметов и хуки листов dnd5e.

Версия модуля: **0.2.0-split** (см. `module.json`).

Распространяется под [лицензией MIT](LICENSE).

## Требования

- Foundry VTT **v14**
- Система **[dnd5e](https://github.com/foundryvtt/dnd5e)** (5.x)
- Модуль **[adventurecraft-core](https://github.com/Hestci/adventurecraft-core)** — включить **до** этого модуля

## Установка

Скопируйте или клонируйте **оба** модуля в `Data/modules/`:

```bash
git clone https://github.com/Hestci/adventurecraft-core.git Data/modules/adventurecraft-core
git clone https://github.com/Hestci/adventurecraft-dnd5e.git Data/modules/adventurecraft-dnd5e
```

В настройках мира:

1. Включить **AdventureCraft Core**
2. Включить **AdventureCraft DnD5e**

**Не включайте** одновременно монолит `adventurecraft-dnd5e` из архива wiki — у него тот же Foundry `id`, что и у bridge.

После правок файлов обновите страницу Foundry (F5).

## Что делает bridge

- адаптер системы dnd5e (`registerSystemAdapter`);
- окно крафта и редактор рецепта на листах предметов;
- настройки критического успеха и полей предмета;
- объединение предметов (combine) — в разработке;
- локализация строк, зависящих от `DND5E.*`.

Логика крафта, хаб, права и мастерство — в **core**.

## Кратко о крафте (для игроков и мастера)

- На листе персонажа — кнопка хаба крафта: рецепты в инвентаре, нехватка ингредиентов, бросок по СЛ.
- Рецепты — предметы Foundry; книги рецептов — контейнеры.
- Мастер создаёт рецепты в редакторе (ингредиенты + образец результата), настраивает проверку, крит и права в настройках core.

Подробное описание UX и монолита v1.2.x — в архивной копии wiki; этот README описывает **split-стек** (core + bridge).

## Ветки

| Ветка | Назначение |
| --- | --- |
| `main` | Стабильная версия |
| `dev` | Разработка, незавершённые изменения |

## Репозитории

- **Core:** https://github.com/Hestci/adventurecraft-core
- **Bridge (этот репозиторий):** https://github.com/Hestci/adventurecraft-dnd5e
