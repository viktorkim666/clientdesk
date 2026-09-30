import { ImageResponse } from "next/og";
import {
  METRICS,
  PREVIEW_URL,
  PROJECTS,
  WORKSPACE_NAME,
} from "@/components/landing/sample-data";
import { ImageMark } from "@/lib/brand-image/mark";
import { SITE_DESCRIPTION } from "@/lib/site";

export const alt = "Clientdesk, a client portal for small agencies";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

// Same line as the landing hero.
const HEADLINE = "Every client project, in one calm place";

const STATUS_COLOR = {
  active: "#34d399",
  on_hold: "#fbbf24",
  done: "#94a3b8",
} as const;

const STATUS_LABEL = {
  active: "Active",
  on_hold: "On hold",
  done: "Done",
} as const;

export default function OpenGraphImage() {
  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        position: "relative",
        overflow: "hidden",
        color: "#f4f4f8",
        background: "#08080d",
      }}
    >
      <div
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          width: "100%",
          height: "100%",
          display: "flex",
          background:
            "radial-gradient(ellipse 1000px 700px at 80% 20%, rgba(79,57,246,0.6), rgba(79,57,246,0) 70%)",
        }}
      />
      <div
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          width: "100%",
          height: "100%",
          display: "flex",
          backgroundImage:
            "linear-gradient(rgba(255,255,255,0.055) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.055) 1px, transparent 1px)",
          backgroundSize: "60px 60px",
        }}
      />

      <div
        style={{
          display: "flex",
          flexDirection: "column",
          width: 560,
          height: "100%",
          padding: "64px 0 64px 72px",
          position: "relative",
        }}
      >
        <div style={{ display: "flex", alignItems: "center" }}>
          <ImageMark size={52} />
          <div
            style={{
              display: "flex",
              marginLeft: 16,
              fontSize: 34,
              letterSpacing: -0.5,
            }}
          >
            Clientdesk
          </div>
        </div>
        <div
          style={{
            display: "flex",
            marginTop: 56,
            fontSize: 68,
            lineHeight: 1.06,
            letterSpacing: -2.5,
          }}
        >
          {HEADLINE}
        </div>
        <div
          style={{
            display: "flex",
            marginTop: 28,
            fontSize: 22,
            lineHeight: 1.45,
            color: "#a3a3b8",
          }}
        >
          {SITE_DESCRIPTION}
        </div>
      </div>

      <div
        style={{
          position: "absolute",
          left: 615,
          top: 150,
          width: 570,
          height: 560,
          display: "flex",
          flexDirection: "column",
          borderRadius: 20,
          background: "#11111a",
          border: "1px solid rgba(255,255,255,0.14)",
          boxShadow: "0 40px 120px rgba(79,57,246,0.45)",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            padding: "16px 20px",
            borderBottom: "1px solid rgba(255,255,255,0.09)",
          }}
        >
          {[0, 1, 2].map((dot) => (
            <div
              key={dot}
              style={{
                display: "flex",
                width: 12,
                height: 12,
                borderRadius: 6,
                marginRight: 8,
                background: "rgba(255,255,255,0.18)",
              }}
            />
          ))}
          <div
            style={{
              display: "flex",
              marginLeft: 60,
              padding: "5px 16px",
              borderRadius: 8,
              fontSize: 15,
              color: "#8a8aa0",
              background: "rgba(255,255,255,0.06)",
            }}
          >
            {PREVIEW_URL}
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", padding: 28 }}>
          <div style={{ display: "flex", fontSize: 26 }}>{WORKSPACE_NAME}</div>
          <div style={{ display: "flex", marginTop: 20, marginBottom: 22 }}>
            {METRICS.map((metric, index) => (
              <div
                key={metric.label}
                style={{
                  display: "flex",
                  flexDirection: "column",
                  width: 156,
                  padding: "14px 12px 14px 14px",
                  marginRight: index === METRICS.length - 1 ? 0 : 12,
                  borderRadius: 12,
                  background: "rgba(255,255,255,0.045)",
                  border: "1px solid rgba(255,255,255,0.09)",
                }}
              >
                <div
                  style={{ display: "flex", fontSize: 14, color: "#8a8aa0" }}
                >
                  {metric.label}
                </div>
                <div
                  style={{
                    display: "flex",
                    marginTop: 6,
                    fontSize: 36,
                    letterSpacing: -1,
                  }}
                >
                  {metric.value}
                </div>
              </div>
            ))}
          </div>

          {PROJECTS.map((project) => (
            <div
              key={project.name}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "16px 4px",
                borderTop: "1px solid rgba(255,255,255,0.09)",
              }}
            >
              <div style={{ display: "flex", flexDirection: "column" }}>
                <div style={{ display: "flex", fontSize: 20 }}>
                  {project.name}
                </div>
                <div
                  style={{
                    display: "flex",
                    marginTop: 3,
                    fontSize: 14,
                    color: "#8a8aa0",
                  }}
                >
                  {project.client} · {project.updated}
                </div>
              </div>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  fontSize: 14,
                  padding: "5px 12px",
                  borderRadius: 999,
                  color: "#d4d4e2",
                  background: "rgba(255,255,255,0.06)",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    width: 8,
                    height: 8,
                    borderRadius: 4,
                    marginRight: 8,
                    background: STATUS_COLOR[project.status],
                  }}
                />
                {STATUS_LABEL[project.status]}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>,
    size,
  );
}
