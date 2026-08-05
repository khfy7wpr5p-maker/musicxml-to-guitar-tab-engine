# MusicXML single-pass safety boundary

This note refines the Milestone 2A architecture documented in `ARCHITECTURE.md`.

## Attribute preservation

`ParsedMusicXmlDocument` stores every XML attribute as an ordered immutable record:

```text
{ name, value, uri }
```

Attributes are not keyed only by local name. This prevents a namespaced attribute such as `x:id` from replacing an unqualified MusicXML attribute such as `id` when both are present on the same element.

Structural and semantic adapters resolve MusicXML attributes using both conditions:

```text
local name matches
AND
namespace URI is empty
```

Attribute order therefore cannot change the interpretation of `id`, `number`, `implicit`, tie `type` or beam `number`.

## Iterative tree operations

The parsed XML tree is frozen with an iterative, cycle-safe traversal. Descendant scans used by the monophonic semantic adapter are also iterative. User-controlled nesting therefore does not rely on the JavaScript call stack and cannot escape the structured parser error contract through an uncontrolled recursive `RangeError`.

Explicit XML depth, element, text, measure, event, deadline and cancellation ceilings remain Milestone 2C work. This safety hardening does not expand the supported musical feature set.
