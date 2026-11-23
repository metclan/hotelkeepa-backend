// Retain the original export for callers; access filtering is centralized.
import { workspace } from "./workspace.controller.js";
export const fetchLocations = workspace.listLocations;
