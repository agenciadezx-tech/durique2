import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Durique",
    short_name: "Durique",
    description: "Agenda, pacientes e turmas da sua clínica.",
    start_url: "/agenda",
    display: "standalone",
    background_color: "#f7f7f5",
    theme_color: "#f7f7f5",
    lang: "pt-BR",
  };
}
