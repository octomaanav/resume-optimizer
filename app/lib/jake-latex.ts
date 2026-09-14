import type { Profile } from "./profile-model";
import { profileSkillDisplayRows } from "./profile-skills";
import { tightenBulletOrphanLine } from "./resume-bullet-fit";
import {
  resumeFilteredExperience,
  resumeFilteredProjects,
} from "./resume-filter";
import { experienceSortKey, projectSortKey } from "./sort-profile";

function latexEscape(input: string) {
  return input
    .replaceAll("\\", "\\textbackslash{}")
    .replaceAll("{", "\\{")
    .replaceAll("}", "\\}")
    .replaceAll("$", "\\$")
    .replaceAll("&", "\\&")
    .replaceAll("#", "\\#")
    .replaceAll("_", "\\_")
    .replaceAll("%", "\\%")
    .replaceAll("~", "\\textasciitilde{}")
    .replaceAll("^", "\\textasciicircum{}");
}

function joinNonEmpty(parts: Array<string | undefined>) {
  return parts.map((p) => (p ?? "").trim()).filter(Boolean).join(" • ");
}

// Regex mirrors the one in jake-preview.tsx and sidebar.js — keep in sync.
const METRIC_RE =
  /\*\*(.+?)\*\*|\$[\d,.]+[KMBkm]?\b|\b\d+(?:[,.]\d+)*(?:\+?%|[xX]\b|\+(?!\d)|\+?[KMBkm]\b|\s*ms\b|\s*s\b|\s*min\b|\s*hrs?\b|\s*hours?\b|\s*days?\b|\s*weeks?\b|\s*months?\b|\s*years?\b|\s+(?:users?|customers?|clients?|engineers?|developers?|teams?|services?|microservices?|features?|requests?|repos?|endpoints?|deployments?|countries?|markets?|applications?)\b)|(?:\d{1,3})(?:,\d{3})+(?:\.\d+)?\b/g;

// Escapes a bullet string for LaTeX, wrapping detected metrics in \textbf{}.
// Must operate on raw text BEFORE latexEscape so the regex patterns still match.
function latexBullet(text: string): string {
  const re = new RegExp(METRIC_RE.source, METRIC_RE.flags);
  let result = "";
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = re.exec(text)) !== null) {
    result += latexEscape(text.slice(lastIndex, match.index));
    const display = match[1] ?? match[0]; // match[1] = inner text of **bold**
    result += `\\textbf{${latexEscape(display)}}`;
    lastIndex = match.index + match[0].length;
  }
  result += latexEscape(text.slice(lastIndex));
  return result;
}

function normalizeUrl(url: string) {
  const u = url.trim();
  if (!u) return "";
  if (u.startsWith("http://") || u.startsWith("https://")) return u;
  return `https://${u}`;
}

function joinWithBars(parts: string[]) {
  return parts.filter(Boolean).join(" $|$ ");
}

export function renderJakeResumeTex(args: {
  profile: Profile;
  experienceIds?: string[];
  projectIds?: string[];
  /** When true, empty id lists mean no rows. When false, empty lists mean "use all". */
  subsetEnabled?: boolean;
  title?: string;
  experienceBulletsById?: Record<string, string[]>;
  projectBulletsById?: Record<string, string[]>;
  /** When true, metrics and numbers in bullet points are wrapped in \textbf{}. */
  highlightMetrics?: boolean;
}) {
  const {
    profile,
    experienceIds = [],
    projectIds = [],
    subsetEnabled = false,
    experienceBulletsById = {},
    projectBulletsById = {},
    highlightMetrics = false,
  } = args;

  let exp = resumeFilteredExperience(profile, subsetEnabled, experienceIds);
  let proj = resumeFilteredProjects(profile, subsetEnabled, projectIds);
  exp = [...exp].sort((a, b) => experienceSortKey(b) - experienceSortKey(a));
  proj = [...proj].sort((a, b) => projectSortKey(b) - projectSortKey(a));

  const contactParts: string[] = [];
  if ((profile.phone ?? "").trim()) contactParts.push(latexEscape(profile.phone ?? ""));
  if ((profile.email ?? "").trim()) {
    const email = (profile.email ?? "").trim();
    contactParts.push(
      String.raw`\href{mailto:${latexEscape(email)}}{\underline{${latexEscape(email)}}}`
    );
  }
  for (const link of profile.links.slice(0, 3)) {
    const url = normalizeUrl(link.url);
    if (!url) continue;
    const label = (link.label || link.url).trim();
    contactParts.push(
      String.raw`\href{${latexEscape(url)}}{\underline{${latexEscape(label)}}}`
    );
  }

  const skillRows = profileSkillDisplayRows(profile);

  const lines: string[] = [];

  // Jake Gutierrez resume skeleton (matches the style you pasted).
  lines.push(String.raw`%-------------------------`);
  lines.push(String.raw`% Resume in Latex`);
  lines.push(String.raw`% Author : Jake Gutierrez`);
  lines.push(String.raw`% Based off of: https://github.com/sb2nov/resume`);
  lines.push(String.raw`% License : MIT`);
  lines.push(String.raw`%------------------------`);
  lines.push("");
  lines.push(String.raw`\documentclass[letterpaper,10pt]{article}`);
  lines.push("");
  lines.push(String.raw`\usepackage{latexsym}`);
  lines.push(String.raw`\usepackage[empty]{fullpage}`);
  lines.push(String.raw`\usepackage{titlesec}`);
  lines.push(String.raw`\usepackage{marvosym}`);
  lines.push(String.raw`\usepackage[usenames,dvipsnames]{color}`);
  lines.push(String.raw`\usepackage{verbatim}`);
  lines.push(String.raw`\usepackage{enumitem}`);
  lines.push(String.raw`\usepackage[hidelinks]{hyperref}`);
  lines.push(String.raw`\usepackage{fancyhdr}`);
  lines.push(String.raw`\usepackage[english]{babel}`);
  lines.push(String.raw`\usepackage{tabularx}`);
  lines.push(String.raw`\ifdefined\pdfglyphtounicode`);
  lines.push(String.raw`  \input{glyphtounicode}`);
  lines.push(String.raw`\fi`);
  lines.push("");
  lines.push(String.raw`\pagestyle{fancy}`);
  lines.push(String.raw`\fancyhf{}`);
  lines.push(String.raw`\fancyfoot{}`);
  lines.push(String.raw`\renewcommand{\headrulewidth}{0pt}`);
  lines.push(String.raw`\renewcommand{\footrulewidth}{0pt}`);
  lines.push("");
  lines.push(String.raw`% Adjust margins`);
  lines.push(String.raw`\addtolength{\oddsidemargin}{-0.6in}`);
  lines.push(String.raw`\addtolength{\evensidemargin}{-0.5in}`);
  lines.push(String.raw`\addtolength{\textwidth}{1.19in}`);
  lines.push(String.raw`\addtolength{\topmargin}{-.7in}`);
  lines.push(String.raw`\addtolength{\textheight}{1.4in}`);
  lines.push("");
  lines.push(String.raw`\urlstyle{same}`);
  lines.push("");
  lines.push(String.raw`\raggedbottom`);
  lines.push(String.raw`\raggedright`);
  lines.push(String.raw`\setlength{\tabcolsep}{0in}`);
  lines.push("");
  lines.push(String.raw`% Sections formatting`);
  lines.push(
    String.raw`\titleformat{\section}{\vspace{-7pt}\scshape\raggedright\large}{}{0em}{}[\color{black}\titlerule \vspace{-5pt}]`
  );
  lines.push("");
  lines.push(String.raw`% Ensure that generate pdf is machine readable/ATS parsable (pdfTeX only)`);
  lines.push(String.raw`\ifdefined\pdfgentounicode`);
  lines.push(String.raw`  \pdfgentounicode=1`);
  lines.push(String.raw`\fi`);
  lines.push("");
  lines.push(String.raw`%-------------------------`);
  lines.push(String.raw`% Custom commands`);
  lines.push(String.raw`\newcommand{\mainheadingsize}{\fontsize{14}{10}\selectfont}`);
  lines.push("");
  lines.push(String.raw`\newcommand{\resumeItem}[1]{`);
  lines.push(String.raw`  \item\small{#1}`);
  lines.push(String.raw`}`);
  lines.push("");
  lines.push(String.raw`\newcommand{\resumeSubheading}[4]{`);
  lines.push(String.raw`  \vspace{-2pt}\item`);
  lines.push(
    String.raw`    \begin{tabular*}{0.97\textwidth}[t]{l@{\extracolsep{\fill}}r}`
  );
  lines.push(String.raw`      \textbf{#1} & #2 \\`);
  lines.push(String.raw`      \textit{\small#3} & \textit{\small #4} \\`);
  lines.push(String.raw`    \end{tabular*}\vspace{-7pt}`);
  lines.push(String.raw`}`);
  lines.push("");
  lines.push(String.raw`\newcommand{\resumeProjectHeading}[2]{`);
  lines.push(String.raw`    \item`);
  lines.push(
    String.raw`    \begin{tabular*}{0.97\textwidth}{l@{\extracolsep{\fill}}r}`
  );
  lines.push(String.raw`      \small#1 & \textit{\small #2} \\`);
  lines.push(String.raw`    \end{tabular*}\vspace{-6pt}`);
  lines.push(String.raw`}`);
  lines.push("");
  lines.push(String.raw`\newcommand{\resumeSubItem}[1]{\resumeItem{#1}\vspace{-4pt}}`);
  lines.push("");
  lines.push(String.raw`\renewcommand\labelitemii{$\vcenter{\hbox{\tiny$\bullet$}}$}`);
  lines.push("");
  lines.push(
    String.raw`\newcommand{\resumeSubHeadingListStart}{\begin{itemize}[leftmargin=0.15in, label={}]}`
  );
  lines.push(String.raw`\newcommand{\resumeSubHeadingListEnd}{\end{itemize} \vspace{-10pt}}`);
  lines.push(String.raw`\newcommand{\resumeItemListStart}{\begin{itemize}}`);
  lines.push(String.raw`\newcommand{\resumeItemListEnd}{\end{itemize}\vspace{-5pt}}`);
  lines.push("");
  lines.push(String.raw`\begin{document}`);
  lines.push("");

  // ----------HEADING----------
  lines.push(String.raw`\begin{center}`);
  lines.push(
    String.raw`    {\fontsize{15}{20} \selectfont \textbf{\scshape ${latexEscape(
      profile.name || "Your Name"
    )}}} \\ \vspace{1pt}`
  );
  if (contactParts.length > 0) {
    lines.push(String.raw`    {\small ${joinWithBars(contactParts)}}`);
  }
  lines.push(String.raw`\end{center}`);
  lines.push("");

  // Education first (matches your sample)
  if (profile.education.length > 0) {
    lines.push(String.raw`\section{Education}`);
    lines.push(String.raw`  \resumeSubHeadingListStart`);
    for (const ed of profile.education) {
      const school = latexEscape(ed.school);
      const loc = latexEscape(ed.location ?? "");
      const degree = latexEscape(ed.degree ?? "");
      const dates = latexEscape(joinNonEmpty([ed.start, ed.end]));
      lines.push(String.raw`    \resumeSubheading`);
      lines.push(String.raw`      {${school}}{${loc}}`);
      lines.push(String.raw`      {${degree}}{${dates}}`);
      if (ed.details.length > 0) {
        lines.push(String.raw`      \resumeItemListStart`);
        for (const d of ed.details) {
          lines.push(String.raw`        \resumeItem{${latexEscape(d)}}`);
        }
        lines.push(String.raw`      \resumeItemListEnd`);
      }
    }
    lines.push(String.raw`  \resumeSubHeadingListEnd`);
    lines.push("");
  }

  if (exp.length > 0) {
    lines.push(String.raw`\section{Experience}`);
    lines.push(String.raw`  \resumeSubHeadingListStart`);
    for (const e of exp) {
      const company = latexEscape(e.company);
      const loc = latexEscape(e.location ?? "");
      const title = latexEscape(e.title);
      const dates = latexEscape(joinNonEmpty([e.start, e.end]));
      lines.push(String.raw`    \resumeSubheading`);
      lines.push(String.raw`      {${company}}{${loc}}`);
      lines.push(String.raw`      {${title}}{${dates}}`);
      const bullets = experienceBulletsById[e.id] ?? e.bullets;
      if (bullets.length > 0) {
        lines.push(String.raw`      \resumeItemListStart`);
        for (const b of bullets) {
          const tightened = tightenBulletOrphanLine(b);
          const rendered = highlightMetrics
            ? latexBullet(tightened)
            : latexEscape(tightened);
          lines.push(`        \\resumeItem{${rendered}}`);
        }
        lines.push(String.raw`      \resumeItemListEnd`);
      }
      lines.push("");
    }
    lines.push(String.raw`  \resumeSubHeadingListEnd`);
    lines.push("");
  }

  if (proj.length > 0) {
    lines.push(String.raw`\section{Projects}`);
    lines.push(String.raw`    \resumeSubHeadingListStart`);
    for (const p of proj) {
      const name = latexEscape(p.name);
      const tech = latexEscape(p.tech.join(", "));
      const dates = latexEscape(joinNonEmpty([p.start, p.end]));
      const linkPart = p.link?.trim()
        ? String.raw` $|$ \href{${p.link.trim()}}{\underline{Link}}`
        : "";
      const techPart = tech ? String.raw` $|$ \emph{${tech}}` : "";
      const left = String.raw`\textbf{${name}}${techPart}${linkPart}`;
      lines.push(String.raw`      \resumeProjectHeading`);
      lines.push(String.raw`          {${left}}{${latexEscape(dates)}}`);
      const bullets = projectBulletsById[p.id] ?? p.bullets;
      if (bullets.length > 0) {
        lines.push(String.raw`          \resumeItemListStart`);
        for (const b of bullets) {
          const tightened = tightenBulletOrphanLine(b);
          const rendered = highlightMetrics
            ? latexBullet(tightened)
            : latexEscape(tightened);
          lines.push(`            \\resumeItem{${rendered}}`);
        }
        lines.push(String.raw`          \resumeItemListEnd`);
      }
      lines.push("");
    }
    lines.push(String.raw`    \resumeSubHeadingListEnd`);
    lines.push("");
  }

  if (skillRows.length > 0) {
    lines.push(String.raw`\section{Skills}`);
    lines.push(String.raw` \begin{itemize}[leftmargin=0.15in, label={}]`);
    lines.push(String.raw`    \small{\item{`);
    const lastIdx = skillRows.length - 1;
    for (let i = 0; i < skillRows.length; i++) {
      const row = skillRows[i];
      const label = latexEscape(row.label);
      const line = latexEscape(row.line);
      const suffix = i === lastIdx ? String.raw` \\` : String.raw` \\`;
      lines.push(String.raw`     \textbf{${label}}{: ${line}}${suffix}`);
    }
    lines.push(String.raw`    }}`);
    lines.push(String.raw`        \end{itemize}`);
    lines.push(String.raw`    \small`);
    lines.push("");
  }

  lines.push(String.raw`\end{document}`);
  lines.push("");

  return lines.join("\n");
}
