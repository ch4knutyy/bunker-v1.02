# GameHub optimization report

- Files inspected: **25**
- Files changed: **9**
- Safe transformation groups: **32**

## Changed files

### `GameHub.ApocalypseEffects.cs`
- Use a target-typed empty collection expression.

### `GameHub.Director.cs`
- Use target-typed empty collection expressions.

### `GameHub.GameActions.cs`
- Use a target-typed empty dictionary expression.
- Convert a local string array to a collection expression.
- Convert a local string array to a collection expression.

### `GameHub.GameMaster.cs`
- Use a target-typed string collection expression.

### `GameHub.GmPanel.cs`
- Use a target-typed empty collection expression.

### `GameHub.Helpers.cs`
- Use an empty collection expression for the declared return type.
- Use a target-typed empty collection expression.

### `GameHub.Lobby.cs`
- Use a target-typed empty collection expression.

### `GameHub.SpecialCards.cs`
- Simplify empty list initialization. ×2
- Simplify empty list initialization. ×2
- Simplify empty list initialization.
- Simplify empty list initialization.
- Simplify empty list initialization.
- Simplify single-item collection argument.
- Simplify single-item collection argument.
- Simplify single-item collection argument.
- Simplify single-item collection argument.
- Simplify single-item collection argument.
- Simplify single-item collection argument. ×2
- Simplify single-item collection argument. ×2
- Simplify single-item collection argument.
- Simplify single-item collection argument.
- Simplify single-item collection argument. ×2
- Simplify single-item collection argument.
- Convert GetSwappableCharacteristicKeys return initializer to a collection expression.
- Convert GetOrdinaryCharacteristicKeys return initializer to a collection expression.

### `GameHub.Threats.cs`
- Avoid an extra ToList call by returning a concrete List.
- Mark a stateless helper as static.
- Remove a redundant conditional with identical branches.
- Return the concrete collection actually consumed by the caller.

## Safety boundaries

- SignalR event names were not changed.
- Public Hub method names and argument contracts were not changed.
- Authorization checks, DTO shapes, gameplay outcomes, and state-transition order were not intentionally changed.
- Existing file names and folder-flat archive structure were preserved.

## Validation performed

- All 25 C# files were decoded successfully.
- Braces, brackets, and parentheses were checked with a comment/string-aware structural scanner.
- ZIP integrity was verified after packaging.
- A full `dotnet build` was not possible because the archive does not contain the complete project and dependency graph.

## Important build step

After replacing the files, run:

```powershell
dotnet build
```

Then check **Error List → Build + IntelliSense** for any remaining style messages specific to the full solution configuration.