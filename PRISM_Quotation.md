# SOFTWARE DEVELOPMENT QUOTATION

---

**Quotation No.:** PRISM/2026/001
**Date:** June 30, 2026
**Valid Until:** July 30, 2026

---

## From

**[Your Company / Freelance Studio Name]**
[Your Address]
[City, State, PIN]
[Email] | [Phone]
[GST No. if applicable]

---

## To

**Airtel / [Client Name]**
[Client Department]
[Client Address]

---

## Subject: Software Development Quotation for PRISM — Network Intelligence Dashboard

---

## 1. Project Overview

**PRISM** (Performance & Real-time Intelligence for Service Management) is a purpose-built
network operations dashboard developed exclusively for Airtel's telecom infrastructure
monitoring needs. The platform provides a unified, interactive view of Transport, BNG,
BRAS, and Mobile network layers across India circles, enabling NOC engineers and
management to monitor utilization, subscriber trends, and network flow in real time.

**Development Period:** April 21, 2026 – June 30, 2026
**Team Size:** 3 Software Developers (Full Stack)
**Technology Stack:** Next.js 14, TypeScript, React-Leaflet, Recharts, Node.js API, XLSX Engine

---

## 2. Scope of Work Delivered

### Module 1 — Core Dashboard Framework & Navigation
- Multi-screen layout with sidebar navigation
- Responsive UI supporting desktop NOC workstations
- Context-aware state management across all screens
- Header with live clock and network status indicators

**Effort: 12 man-days**

---

### Module 2 — Transport Network Intelligence Map
- Interactive pan/zoom map of India with transport node overlays
- City-level and district-level drilldown
- Node health status with colour-coded indicators
- Link utilization visualization across transport segments
- District-circle mapping with 500+ coordinate data points
- Geospatial GeoJSON rendering of India state boundaries

**Effort: 18 man-days**

---

### Module 3 — BNG (Broadband Network Gateway) Analytics
- BNG node visualization on network map (AE & subscriber layers)
- XLSX upload pipeline for BNG subscriber utilization reports
- Hourly subscriber utilization trend charts (24-hour view)
- Multi-BNG comparison and filtering
- Upload history management with file listing
- REST API: `/api/bng/upload`, `/api/bng/list`, `/api/bng/load`
- Subscriber-specific sub-module: `/api/bng/upload-subscriber`, `/api/bng/list-subscriber`, `/api/bng/load-subscriber`

**Effort: 22 man-days**

---

### Module 4 — BRAS (Broadband Remote Access Server) Analytics
- BRAS subscriber count monitoring
- Utilization trend reporting from uploaded BRAS hourly reports
- REST API: `/api/bras/upload`, `/api/bras/list`, `/api/bras/load`
- Data normalization engine for Airtel BRAS report format

**Effort: 14 man-days**

---

### Module 5 — Transport Flow Analysis
- Transport flow screen with hub-to-hub traffic visualization
- Upload pipeline for transport flow Excel reports
- REST API: `/api/transport/upload`, `/api/transport/list`, `/api/transport/load`
- Flow categorization and volume rendering per segment

**Effort: 10 man-days**

---

### Module 6 — Mobile Network Module
- Mobile network map with tower/hub overlay
- Mobile hubs map with district-level cluster view
- Mobile flow screen (actual vs. ideal flow comparison)
- Ideal flow view for capacity planning reference
- 4 dedicated mobile data layers (volume, flow, hub, network)

**Effort: 20 man-days**

---

### Module 7 — Data Processing & XLSX Engine
- Custom XLSX parsing engine (no third-party cloud dependency)
- Supports Airtel's internal report formats for BNG, BRAS, Transport
- Data normalization, error handling, and type validation
- Processes files up to 50MB in-browser and server-side

**Effort: 8 man-days**

---

### Module 8 — Alerts & Insights Engine
- Alerts sidebar with threshold-based notification display
- Insights panel with summarized network health indicators
- Chart panels for comparative visualization across time periods
- Right panel context view for selected nodes

**Effort: 6 man-days**

---

### Module 9 — Geospatial Data & Infrastructure
- India states GeoJSON (simplified for performance)
- 500+ city/district coordinate dataset
- District-to-circle mapping (all Airtel circles)
- Hub-volume and mobile-volume reference datasets
- Deployment-ready Next.js build configuration

**Effort: 5 man-days**

---

## 3. Effort Summary

| Module | Man-Days |
|--------|----------|
| Core Dashboard & Navigation | 12 |
| Transport Network Map | 18 |
| BNG Analytics (6 APIs) | 22 |
| BRAS Analytics (3 APIs) | 14 |
| Transport Flow (3 APIs) | 10 |
| Mobile Network Module | 20 |
| XLSX Data Processing Engine | 8 |
| Alerts & Insights Engine | 6 |
| Geospatial Data & Infrastructure | 5 |
| **Total** | **115 man-days** |

---

## 4. Resource & Rate Card

| Role | Days | Day Rate (INR) | Amount (INR) |
|------|------|----------------|--------------|
| Senior Full Stack Developer (Lead) | 45 | ₹7,000 | ₹3,15,000 |
| Full Stack Developer | 40 | ₹5,500 | ₹2,20,000 |
| Frontend / Data Developer | 30 | ₹5,000 | ₹1,50,000 |
| **Development Subtotal** | **115** | | **₹6,85,000** |

---

## 5. Cost Breakdown

| Item | Amount (INR) |
|------|--------------|
| Development (as above) | ₹6,85,000 |
| Project Management & Coordination (15%) | ₹1,02,750 |
| Telecom Domain Research & Data Modelling | ₹75,000 |
| UI/UX Design & Prototyping | ₹60,000 |
| QA & Testing | ₹50,000 |
| Technical Documentation | ₹40,000 |
| Deployment & Environment Setup | ₹35,000 |
| **Software Development Total** | **₹10,47,750** |

---

## 6. Licensing & IP Transfer

| Item | Amount (INR) |
|------|--------------|
| Full Source Code Ownership Transfer | ₹2,00,000 |
| Perpetual License (no recurring royalty) | ₹1,50,000 |
| Airtel-exclusive rights (no resale to other telcos) | ₹1,00,000 |
| **IP & Licensing Total** | **₹4,50,000** |

---

## 7. Post-Delivery Support (Optional but Recommended)

| Item | Duration | Amount (INR) |
|------|----------|--------------|
| Annual Maintenance Contract (AMC) | 12 months | ₹2,40,000 |
| Bug fixes, minor enhancements, data format updates | Included in AMC | — |
| Priority support SLA (48-hour response) | Included in AMC | — |

---

## 8. Grand Total

| | Amount (INR) |
|---|---|
| Software Development | ₹10,47,750 |
| IP & Licensing | ₹4,50,000 |
| AMC (1 Year) | ₹2,40,000 |
| **Grand Total (excl. GST)** | **₹17,37,750** |
| GST @ 18% | ₹3,12,795 |
| **Grand Total (incl. GST)** | **₹20,50,545** |

---

## 9. Payment Terms

| Milestone | % | Amount (INR) |
|-----------|---|--------------|
| On signing of agreement | 40% | ₹6,95,100 |
| On delivery of software & source code | 40% | ₹6,95,100 |
| On completion of 30-day stabilization | 20% | ₹3,47,550 |
| **Total** | 100% | **₹17,37,750** |

*(GST payable as applicable on each invoice)*

---

## 10. What is NOT Included in This Quotation

The following are **out of scope** and would be quoted separately if required:

- User authentication / SSO / LDAP integration
- Database backend (PostgreSQL / cloud DB)
- Automated data ingestion (SFTP/API integration with Airtel OSS/BSS)
- Real-time alert notifications (email/SMS)
- Mobile app (Android/iOS)
- Multi-circle multi-tenant setup
- Server hosting/cloud infrastructure costs

---

## 11. Notes

1. All rates are in Indian Rupees (INR).
2. This quotation is valid for 30 days from date of issue.
3. Source code will be handed over upon receipt of final payment.
4. Any changes to scope post-agreement will be quoted separately.
5. Hosting/infrastructure costs are borne by the client.

---

## 12. Acceptance

By signing below, the client agrees to the scope, costs, and payment terms outlined in this quotation.

| | Client | Vendor |
|---|---|---|
| **Name** | | |
| **Designation** | | |
| **Signature** | | |
| **Date** | | |

---

*This quotation was prepared by [Your Name/Company]. For queries contact [email/phone].*
