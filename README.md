# FlowMRI - Quantitative Phase-Contrast MRI Analyzer

🚀 **Live Demo**: [emerteroglu.github.io/QuantitativePhaseContrastMRI](https://emerteroglu.github.io/QuantitativePhaseContrastMRI/)

**FlowMRI** is a high-performance, client-side web application designed for quantitative flow analysis of Phase-Contrast MRI (PC-MRI) data, particularly optimized for Cerebrospinal Fluid (CSF) dynamics in the Aqueduct of Sylvius. Built with React, TypeScript, and high-performance HTML5 canvases, it runs entirely in the browser—ensuring patient data never leaves your local environment.

---

## Key Features

- **Zero-Server Client-Side Parser**: Load and analyze DICOM files directly in the browser. 
- **Automated Series Matching**: Auto-aligns Magnitude and Phase contrast series from raw image collections (e.g., standard cardiac cycle frame offsets).
- **Advanced VENC Parsing**: Extracts Velocity Encoding (VENC) values from standard tags `(0018, 9217)` as well as private manufacturer tags (GE, Siemens, Philips), normalizing unit inconsistencies (e.g. mm/s vs. cm/s).
- **Auto-Scale Velocity Normalization**: Automatically parses and converts pixel values to velocities via Rescale Slope and Intercept, auto-correcting 10x workstation scaling errors found in raw vendor files.
- **Manual Region of Interest (ROI) Tools**:
  - **Circle ROI**: Scalable and draggable templates.
  - **Polygon ROI**: Customizable vertex-by-vertex paths with draggable nodes.
  - **ROI Propagation**: Copy and project ROIs across all cardiac cycle frames to accelerate workflow.
- **Synchronized Viewports**: Side-by-side synchronized viewports for Magnitude and Phase images. Zoom/Pan coordinates are locked and maintained across cardiac frame switches.
- **Interactive Control Mechanics**:
  - **Mouse Scroll Wheel**: Rapidly step back and forth through cardiac frames.
  - **Cmd/Ctrl + Scroll**: Zoom to cursor on both viewports simultaneously.
  - **Static Inspector Bar**: View real-time coordinates, raw pixel value, and local velocity under the mouse cursor without UI layout jitter.
- **Clinical Math & Analytics**:
  - Automatically integrates flow rate ($mL/min$), velocity profiles ($cm/s$), and cross-sectional areas ($mm^2$).
  - Calculates **Aqueductal Stroke Volume**:
    $$\text{Stroke Volume} = \frac{|\text{Forward Flow Volume}| + |\text{Backward Flow Volume}|}{2}$$
  - Toggle reports statefully between **per beat** (clinical default) or **per second**.
- **Hospital-Grade Reporting**: Generates interactive charts, structured print/PDF summaries, and CSV data exports for research.

---

## Tech Stack

- **Framework**: React 18, Vite
- **Language**: TypeScript
- **Styling**: Vanilla CSS (TailwindCSS-free, structured using modern CSS custom properties and clinical dark mode variables)
- **DICOM Parsing**: Custom lightweight client-side DICOM stream parser

---

## Getting Started

### Prerequisites

Ensure you have [Node.js](https://nodejs.org/) installed (v18+ recommended).

### Installation

1. Clone the repository:
   ```bash
   git clone https://github.com/your-username/QuantitativePhaseContrastMRI.git
   cd QuantitativePhaseContrastMRI
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Run the development server:
   ```bash
   npm run dev
   ```
   Open `http://localhost:5173` in your browser.

4. Build for production:
   ```bash
   npm run build
   ```
   The static build files will be generated in the `dist/` directory, which can be deployed to any static hosting provider (GitHub Pages, Vercel, Netlify, or local hospital intranets).

---

## License

This project is licensed under the MIT License.
