// =============================================================================
// STIMULUS APPLICATION
// Harmonices Mundi
// =============================================================================

import { Application } from "@hotwired/stimulus";

const application = Application.start();
application.debug = false;
window.Stimulus = application;

import OrreryController from "./controllers/orrery_controller.js";
application.register("orrery", OrreryController);

import ChapterController from "./controllers/chapter_controller.js";
application.register("chapter", ChapterController);

export { application };
