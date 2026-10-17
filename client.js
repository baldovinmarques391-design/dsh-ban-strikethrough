/**
 * `dsh-ban-strikethrough` — browser half.
 *
 * WHY THIS EXISTS
 * The Web markdown renderer parses untrusted GFM with micromark's strikethrough
 * extension at its default `singleTilde: true`, so ONE `~` opens the span and
 * the next `~` closes it. A single tilde is the ordinary range dash in this
 * kind of prose, and two ranges in one paragraph pair up across everything
 * between them:
 *
 *     要求 200400~稳定只给~113134      ->   要求 200400[稳定只给 struck]113134
 *
 * The model never means a deletion there, and the two `~` characters are
 * silently eaten. So the fix has two halves, both in one stylesheet:
 *
 *   1. `text-decoration: none` on the element the renderer emits, which kills
 *      the line in the chat transcript AND in the document preview's Markdown
 *      tab (both render through the same primitive, see below);
 *   2. `::before` / `::after` put the consumed marker back, so the rendered
 *      text is character-for-character what the model wrote.
 *
 * WHY IT IS `del`, AND WHAT IT LEAVES ALONE
 * `@deepseek-ai/dsh-client-ui-primitives` renders a `delete` node itself
 * (`case "delete": jsx("del", ...)`) and never styles that element, so a plain
 * author rule beats the UA `line-through`. Nothing else in the Web client
 * emits a `<del>` element: terminal ANSI strikethrough (SGR 9) is an inline
 * `text-decoration` on a span, the composer's rich-text editor uses inline
 * marks, and the diff cards use their own classes. Those all keep working.
 *
 * Surfaces reached: conversation messages, thinking rows, and the document
 * preview's Markdown body — all of them mount this primitive. Not reached (by
 * design): sandboxed preview iframes (HTML documents, PDF, Excel), which are
 * separate documents and whose content is the file's own, not model Markdown.
 *
 * Registered as a Cordis effect, so unloading or disabling the plugin removes
 * the stylesheet tag with it.
 */
window.__ModuleLoader__.load({
  id: 'dsh-ban-strikethrough',
  factory() {
    const PLUGIN_ID = 'dsh-ban-strikethrough';
    const CSS = `
/* A delete node from GFM markdown must never paint a deletion: the marker is a
   range dash, not an edit. */
del,
s,
strike {
  text-decoration: none;
}

/* Put the consumed ~ marker back, so the text reads exactly as it was written.
   (micromark's singleTilde default means one ~ per side is the accidental
   case; an intentional ~~pair~~ renders as ~pair~ — still no deletion.) */
del::before,
del::after {
  content: "~";
  text-decoration: none;
}
`;

    /**
     * Mount the stylesheet for exactly the plugin's lifetime.
     * @param ctx - Owning plugin context.
     */
    function apply(ctx) {
      if (typeof document === 'undefined') return;
      ctx.effect(() => {
        const tag = document.createElement('style');
        tag.dataset.plugin = PLUGIN_ID;
        tag.dataset.pluginCss = `${PLUGIN_ID}/ban-strikethrough.css`;
        tag.textContent = CSS;
        document.head.appendChild(tag);
        return () => {
          tag.remove();
        };
      }, 'ban-strikethrough: markdown stylesheet');
    }

    return { apply };
  },
});
