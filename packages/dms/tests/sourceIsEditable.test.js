/**
 * One Editable flag for internal and external sources (planning/tasks/current/source-editable-flag-everywhere.md).
 * What a section offers follows the `isEditable` it holds for its source. A section saved before the flag
 * existed holds none for an internal source and keeps offering edits until the source is read; the server
 * is the judge either way.
 */
import { describe, it, expect } from "vitest";
import { sourceIsEditable } from "../src/patterns/page/components/sections/components/dataWrapper/schema";

describe("sourceIsEditable", () => {
    it("follows the flag for an internal source", () => {
        expect(sourceIsEditable({ isDms: true, isEditable: true })).toBe(true);
        expect(sourceIsEditable({ isDms: true, isEditable: false })).toBe(false);
    });
    it("follows the flag for an external source", () => {
        expect(sourceIsEditable({ isDms: false, isEditable: true })).toBe(true);
        expect(sourceIsEditable({ isDms: false, isEditable: false })).toBe(false);
    });
    it("with no value held: an internal source stays offered for edits, an external one does not", () => {
        expect(sourceIsEditable({ isDms: true })).toBe(true);
        expect(sourceIsEditable({ isDms: false })).toBe(false);
        expect(sourceIsEditable(undefined)).toBe(false);
    });
});
