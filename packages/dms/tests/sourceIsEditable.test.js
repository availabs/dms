/**
 * One Editable flag for internal and external sources (planning/tasks/current/source-editable-flag-everywhere.md).
 * What a section offers follows the source's `isEditable`; a source with no value is an older row, and
 * reads as it always did: an internal one editable, an external one not.
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
    it("reads no value as editable for an internal source and not editable for an external one", () => {
        expect(sourceIsEditable({ isDms: true })).toBe(true);
        expect(sourceIsEditable({ isDms: false })).toBe(false);
        expect(sourceIsEditable(undefined)).toBe(false);
    });
});
