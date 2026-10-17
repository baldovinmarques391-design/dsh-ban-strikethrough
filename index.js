/**
 * Host half of `dsh-ban-strikethrough`.
 *
 * The whole behavior is in the browser half (`./client`, declared through
 * `dsh.client` in package.json). This Host row exists so the profile carries
 * one Loader entry that can be enabled, disabled, inspected, and patched — the
 * same shape every other bundle in this profile uses.
 */
export function apply() {}
