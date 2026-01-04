# Changelog

All notable changes to this skill will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

## [1.0.0] - 2025-01-03

### Added
- **Core Browser Automation**:
  - Chrome browser launching with Puppeteer
  - Cross-platform Chrome detection (macOS, Linux, Windows)
  - Profile sync support for cookie/login state
  - Remote debugging port configuration
  - Headless mode option

- **Page Navigation**:
  - URL navigation with configurable wait conditions (load, domcontentloaded, networkidle0, networkidle2)
  - New tab creation support
  - Redirect handling

- **JavaScript Execution**:
  - Single expression evaluation
  - Multi-line script execution (IIFE)
  - File-based script execution
  - Rich output formatting

- **Screenshot Capture**:
  - Viewport screenshot
  - Full-page screenshot
  - PNG and JPEG format support
  - Custom output path with timestamped defaults

- **Interactive Element Picking**:
  - Visual DOM element selection overlay
  - Multi-selection support (Cmd/Ctrl+click)
  - Rich element information (tag, id, class, text, HTML, parent chain)
  - Element breadcrumbs for easy identification

- **Documentation**:
  - Comprehensive SKILL.md with usage examples
  - Design notes in references/design.md
  - Well-documented scripts

### Dependencies
- **puppeteer-core**: ^22.0.0
- **Node.js**: >=18.0.0
- **Chrome/Chromium**: Any recent version

### Technical Details
- ESM modules only (import/export)
- Manual argument parsing via process.argv
- Process exit codes (0 for success, 1 for errors)
- Descriptive error messages to console.error