# Smart Classroom Monitoring and Examination Integrity System

Source: problem statement supplied by the project owner on 30 October 2026. Line wrapping and obvious spacing errors have been normalized; the requirements have not been expanded. Changes to this baseline must be explicitly requested by the project owner and reflected in the requirements matrix.

## Background

Educational institutions increasingly rely on computer laboratories for teaching, practical examinations, programming assessments, and online evaluations. Instructors and invigilators face difficulties monitoring many student computers simultaneously. Students may access prohibited websites, switch applications, use unauthorized AI tools, or communicate during examinations. Traditional physical invigilation cannot continuously observe every screen, while existing solutions may not provide the customizable examination-focused alerts, reporting, and controls an institution requires.

## Problem

Design and develop a centralized classroom monitoring and management system that allows authorized teachers and examination invigilators to monitor multiple student computers in real time from one dashboard.

Lightweight agents installed on institution-managed student computers should securely provide screen previews, application activity, and examination events. The platform must detect potential examination policy violations, generate timely alerts, support classroom controls, and work efficiently over local networks. Monitoring must be limited to authorized educational sessions with appropriate visibility and safeguards.

## Technical requirements

| Component            | Expected capabilities                                                     |
| -------------------- | ------------------------------------------------------------------------- |
| Student Agent        | Lightweight service for institution-managed lab computers                 |
| Instructor Dashboard | Web or desktop grid view and focused individual screen                    |
| Communication        | Encrypted WebSocket, WebRTC or comparable real-time channel               |
| Monitoring           | Screen preview/streaming, active-window information and rule-based alerts |
| Server               | Session handling, device enrollment, event aggregation                    |
| Security             | Authentication, encryption, audit logs and role permissions               |
| Platform Support     | Windows and Linux initially; macOS as an extension                        |
| Deployment           | LAN operation with optional centralized/cloud administration              |

## How this statement is used

The measurable interpretation is in [REQUIREMENTS.md](REQUIREMENTS.md). Priorities and implementation order are in [ROADMAP.md](ROADMAP.md). Every progress report and implementation change must cite the requirements it serves and the evidence for its completion. Supporting features are explicitly identified so that feature volume does not substitute for meeting the core statement.
