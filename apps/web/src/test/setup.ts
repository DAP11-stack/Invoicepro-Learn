import { cleanup } from "@testing-library/react";
import { afterEach, vi } from "vitest";

afterEach(() => cleanup());

Object.defineProperty(window, "scrollTo", { value: vi.fn(), writable: true });
Object.defineProperty(window, "confirm", { value: vi.fn(() => true), writable: true });
Object.defineProperty(URL, "createObjectURL", { value: vi.fn(() => "blob:invoice"), writable: true });
Object.defineProperty(URL, "revokeObjectURL", { value: vi.fn(), writable: true });
