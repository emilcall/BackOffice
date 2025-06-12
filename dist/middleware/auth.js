"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.isAuthenticated = isAuthenticated;
function isAuthenticated(req, res, next) {
    console.log('Auth check: always true (placeholder)');
    return next();
}
