#! /usr/bin/env node
// @ts-check
import * as path from "node:path";
import { promises as fs, mkdirSync } from "node:fs";
import { parse } from "node-html-parser";
import {
  intro,
  text,
  outro,
  log,
  cancel,
  note,
  isCancel,
  spinner,
  confirm,
} from "@clack/prompts";
import parseArgv from "tiny-parse-argv";
import { glob } from "glob";
import { exec } from "node:child_process";
import { loadConfig, optimize } from "svgo";
const cwd = process.cwd();

const args = parseArgv(process.argv.slice(2));
const command = args._[0];
const verbose = args.v || args.verbose;

function logVerbose(message) {
  if (verbose) log.info(message);
}

const framework = await detectFramework();

let hasSrc = await fs
  .stat("./src")
  .then(() => true)
  .catch(() => false);

let hasApp = await fs
  .stat("./app")
  .then(() => true)
  .catch(() => false);

if (!hasApp) {
  hasApp = await fs
    .stat("./src/app")
    .then(() => true)
    .catch(() => false);
}
let componentFolder = `components/ui`;
if (hasSrc) {
  componentFolder = `src/components/ui`;
}
if (framework !== "next" && hasApp) {
  componentFolder = `app/components/ui`;
  if (hasSrc) {
    componentFolder = `src/app/components/ui`;
  }
}

intro(`Icons CLI`);

switch (command) {
  case "build":
    if (args.help) {
      log.message(
        `icons build
  Build SVG icons into a sprite sheet
  Options:
    -i, --input     The relative path where the source SVGs are stored
    -o, --output    Where the output sprite sheet and types should be stored
    --spriteDir     Where the output sprite sheet should be stored (default to output param)
    --optimize      Optimize the output SVG using SVGO. 
    --help          Show help
  `,
        { symbol: "👋" }
      );
      break;
    }
    await build();
    break;
  case "init":
    if (args.help) {
      log.message(
        `icons init
  Initialize the Icon component
  Options:
    -o, --output    Where to store the Icon component
    -t, --types     Where to store the default type definition file
    --help          Show help
  `,
        { symbol: "👋" }
      );
      break;
    }
    await init();
    break;
  default:
    log.message(
      `icons <command>
  Commands:
    icons build   Build SVG icons into a sprite sheet
    icons init    Initialize the Icon component
  Options:
    --help        Show help
`,
      { symbol: "👋" }
    );
    break;
}

async function build() {
  let shouldOptimize = !!args.optimize;
  let input = args.i || args.input;
  let output = args.o || args.output;
  let giveHint = false;
  if (!input) {
    giveHint = true;
    input = await text({
      message: "Where are the input SVGs stored?",
      initialValue: "other/svg-icons",

      validate(value) {
        if (value.length === 0) return `Input is required!`;
      },
    });
  }
  if (isCancel(input)) process.exit(1);
  const inputDir = path.join(cwd, input);
  const inputDirRelative = path.relative(cwd, inputDir);

  if (!output) {
    giveHint = true;
    let initialValue = `${componentFolder}/icons`;
    if (framework === "next") {
      initialValue = `public/icons`;
    }
    output = await text({
      message: "Where should the output be stored?",
      initialValue,
      validate(value) {
        if (value.length === 0) return `Output is required!`;
      },
    });
  }
  if (isCancel(output)) process.exit(1);
  const outputDir = path.join(cwd, output);
  const spriteDir = path.join(cwd, args.spriteDir ?? output);
  if (typeof args.optimize === "undefined") {
    const choseOptimize = await confirm({
      message: "Optimize the output SVG using SVGO?",
    });
    if (isCancel(choseOptimize)) process.exit(1);
    shouldOptimize = choseOptimize;
  }
  if (giveHint) {
    note(
      `You can also pass these options as flags:
      
icons build -i ${input} -o ${output}${shouldOptimize ? " --optimize" : ""}`,
      "Psst"
    );
  }
  const files = glob
    .sync("**/*.svg", {
      cwd: inputDir,
    })
    .sort((a, b) => a.localeCompare(b));

  if (files.length === 0) {
    cancel(`No SVG files found in ${inputDirRelative}`);
    process.exit(1);
  } else {
    mkdirSync(outputDir, { recursive: true });
    const spriteFilepath = path.join(spriteDir, "sprite.svg");
    const typeOutputFilepath = path.join(outputDir, "name.d.ts");
    const currentSprite = await fs
      .readFile(spriteFilepath, "utf8")
      .catch(() => "");
    const currentTypes = await fs
      .readFile(typeOutputFilepath, "utf8")
      .catch(() => "");
    const iconNames = files.map((file) => iconName(file));
    const spriteUpToDate = iconNames.every((name) =>
      currentSprite.includes(`id=${name}`)
    );
    const typesUpToDate = iconNames.every((name) =>
      currentTypes.includes(`"${name}"`)
    );
    if (spriteUpToDate && typesUpToDate) {
      logVerbose(`Icons are up to date`);
      return;
    }
    logVerbose(`Generating sprite for ${inputDirRelative}`);
    const spriteChanged = await generateSvgSprite({
      files,
      inputDir,
      outputPath: spriteFilepath,
      shouldOptimize,
    });
    for (const file of files) {
      logVerbose(`✅ ${file}`);
    }
    logVerbose(`Saved to ${path.relative(cwd, spriteFilepath)}`);
    const stringifiedIconNames = iconNames.map((name) => JSON.stringify(name));
    const typeOutputContent = `// This file is generated by npm run build:icons
  
  export type IconName =
  \t| ${stringifiedIconNames.join("\n\t| ")};
  `;
    const typesChanged = await writeIfChanged(
      typeOutputFilepath,
      typeOutputContent
    );
    logVerbose(`Manifest saved to ${path.relative(cwd, typeOutputFilepath)}`);
    const readmeChanged = await writeIfChanged(
      path.join(outputDir, "README.md"),
      `# Icons
  
  This directory contains SVG icons that are used by the app.
  
  Everything in this directory is generated by running \`icons build\`.
  `
    );
    if (spriteChanged || typesChanged || readmeChanged) {
      log.info(`Generated ${files.length} icons`);
    }
  }
}

async function init() {
  let output = args.o || args.output;
  let types = args.t || args.types;

  let isTs = !!types;
  if (!types) {
    if (await fs.stat("./tsconfig.json").catch(() => false)) {
      isTs = true;
      types = await text({
        message: "Where should the default Icon types be stored?",
        initialValue: `types/icon-name.d.ts`,
        validate(value) {
          if (value.length === 0) return `Type is required!`;
        },
      });
      if (isCancel(types)) {
        log.warn(
          `You'll need to create a types/icon-name.d.ts file yourself and update your tsconfig.json to include it.`
        );
      }
      // Set up the default types folder and file
      const typesFile = `// This file is a fallback until you run npm run icons build

export type IconName = string;
`;

      const typesDir = path.join(cwd, types);
      try {
        await fs.mkdir(path.dirname(typesDir), { recursive: true });
        await fs.writeFile(typesDir, typesFile);
      } catch {
        log.error(`Could not write to ${typesDir}`);
        log.warn(
          `You'll need to create a types/icon-name.d.ts file yourself and update your tsconfig.json to include it.`
        );
      }
    }
  }

  if (!output) {
    output = await text({
      message: "Where should the Icon component be stored?",
      initialValue: `${componentFolder}/Icon.${isTs ? "tsx" : "jsx"}`,
      validate(value) {
        if (value.length === 0) return `Output is required!`;
      },
    });
  }
  if (isCancel(output)) process.exit(1);
  const outputDir = path.join(cwd, output);

  let hrefImportExport = `import href from "./icons/sprite.svg";

export { href };`;

  if (framework === "next") {
    hrefImportExport = `// Be sure to configure the icon generator to output to the public folder
const href = "/icons/sprite.svg";

export { href };`;
  }

  const iconFileTs = `
import { type SVGProps } from "react";
// Configure this path in your tsconfig.json
import { type IconName } from "~/icon-name";
import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";
${hrefImportExport}

export { IconName };

const sizeClassName = {
  font: "w-[1em] h-[1em]",
  xs: "w-3 h-3",
  sm: "w-4 h-4",
  md: "w-5 h-5",
  lg: "w-6 h-6",
  xl: "w-7 h-7",
} as const;

type Size = keyof typeof sizeClassName;

const childrenSizeClassName = {
  font: "gap-1.5",
  xs: "gap-1.5",
  sm: "gap-1.5",
  md: "gap-2",
  lg: "gap-2",
  xl: "gap-3",
} satisfies Record<Size, string>;

/**
 * Renders an SVG icon. The icon defaults to the size of the font. To make it
 * align vertically with neighboring text, you can pass the text as a child of
 * the icon and it will be automatically aligned.
 * Alternatively, if you're not ok with the icon being to the left of the text,
 * you need to wrap the icon and text in a common parent and set the parent to
 * display "flex" (or "inline-flex") with "items-center" and a reasonable gap.
 */
export function Icon({
  name,
  size = "font",
  className,
  children,
  ...props
}: SVGProps<SVGSVGElement> & {
  name: IconName;
  size?: Size;
}) {
  if (children) {
    return (
      <span
        className={\`inline-flex items-center \${childrenSizeClassName[size]}\`}
      >
        <Icon name={name} size={size} className={className} {...props} />
        {children}
      </span>
    );
  }
  return (
    <svg
      {...props}
      className={twMerge(clsx(sizeClassName[size], "inline self-center", className))}
    >
      <use href={\`\${href}#\${name}\`} />
    </svg>
  );
}

`;

  const iconFileJs = `
import { clsx } from "clsx";
import { twMerge } from "tailwind-merge";
${hrefImportExport}
export { IconName };

const sizeClassName = {
  font: "w-[1em] h-[1em]",
  xs: "w-3 h-3",
  sm: "w-4 h-4",
  md: "w-5 h-5",
  lg: "w-6 h-6",
  xl: "w-7 h-7",
};
const childrenSizeClassName = {
  font: "gap-1.5",
  xs: "gap-1.5",
  sm: "gap-1.5",
  md: "gap-2",
  lg: "gap-2",
  xl: "gap-3",
};
/**
 * Renders an SVG icon. The icon defaults to the size of the font. To make it
 * align vertically with neighboring text, you can pass the text as a child of
 * the icon and it will be automatically aligned.
 * Alternatively, if you're not ok with the icon being to the left of the text,
 * you need to wrap the icon and text in a common parent and set the parent to
 * display "flex" (or "inline-flex") with "items-center" and a reasonable gap.
 */
export function Icon({ name, size = "font", className, children, ...props }) {
  if (children) {
    return (
      <span
        className={\`inline-flex items-center \${childrenSizeClassName[size]}\`}
      >
        <Icon name={name} size={size} className={className} {...props} />
        {children}
      </span>
    );
  }
  return (
    <svg
      {...props}
      className={twMerge(clsx(sizeClassName[size], "inline self-center", className))}
    >
      <use href={\`\${href}#\${name}\`} />
    </svg>
  );
}
`;

  // Write files
  try {
    await fs.mkdir(path.dirname(outputDir), { recursive: true });
    await fs.writeFile(outputDir, isTs ? iconFileTs : iconFileJs, "utf8");
  } catch (err) {
    log.error(`Could not write to ${outputDir}`);
    log.warn(`You'll need to create an Icon component yourself`);
    process.exit(1);
  }

  // Install dependencies
  const dependencies = ["clsx", "tailwind-merge"];

  // Detect the package manager
  let command = "npm install --save";
  if (await fs.stat("yarn.lock").catch(() => false)) {
    command = "yarn add";
  }
  // pnpm
  if (await fs.stat("pnpm-lock.yaml").catch(() => false)) {
    command = "pnpm add";
  }
  // bun
  if (await fs.stat("bun.lockb").catch(() => false)) {
    command = "bun add";
  }

  const s = spinner();
  s.start("Installing dependencies");
  try {
    await new Promise((res, fail) => {
      const op = exec(`${command} ${dependencies.join(" ")}`, (err, stdout) => {
        if (err) {
          fail(err);
        }
        res(true);
      });

      op.addListener("message", (message) => {
        message
          .toString()
          .trim()
          .split("\n")
          .forEach((line) => {
            s.message(line);
          });
      });
    });

    s.stop("Installed dependencies");
  } catch (err) {
    s.stop("Failed to install dependencies");
    log.error(err);
    process.exit(1);
  }

  let iconsOutput = `${componentFolder}/icons`;
  if (framework === "next") {
    iconsOutput = `public/icons`;
  }

  outro(`Icon component created at ${outputDir}
  
Be sure to run \`icons build\` to generate the icons. You can also add something like this to your build script:

"build:icons": "icons build -i other/svg-icons -o ${iconsOutput}"

Consider using https://sly-cli.fly.dev to automatically add icons and run the build script for you.
${
  isTs
    ? `
If you're using TypeScript, you'll need to configure your tsconfig.json to include the generated types:

"paths": {
  "~/icon-name": ["${iconsOutput}/name.d.ts", "${types}"]
}`
    : ""
}`);
}

async function detectFramework() {
  // Read the package.json and look for the dependencies
  // Check for next.js, remix, or vite
  // If none of those are found, ask the user
  try {
    var packageJson = await parsePackageJson();
  } catch {
    return "unknown";
  }

  if (packageJson.dependencies["next"]) return "next";
  if (packageJson.dependencies["vite"] || packageJson.devDependencies["vite"])
    return "vite";
  if (
    packageJson.dependencies["remix"] ||
    packageJson.dependencies["@remix-run/react"]
  )
    return "remix";
  return "unknown";
}

async function parsePackageJson() {
  let dir = process.cwd();
  let packageJson;
  while (!packageJson) {
    console.log(path.join(dir, "package.json"));
    try {
      packageJson = await fs.readFile(path.join(dir, "package.json"), "utf8");
    } catch (err) {
      console.log(err);
      if (dir === "/") {
        throw new Error("Could not find package.json");
      }
      dir = path.dirname(dir);
    }
  }
  return JSON.parse(packageJson);
}

function iconName(file) {
  return file.replace(/\.svg$/, "");
}
/**
 * Creates a single SVG file that contains all the icons
 */
async function generateSvgSprite({
  files,
  inputDir,
  outputPath,
  shouldOptimize,
}) {
  // Each SVG becomes a symbol and we wrap them all in a single SVG
  const symbols = await Promise.all(
    files.map(async (file) => {
      const input = await fs.readFile(path.join(inputDir, file), "utf8");
      const root = parse(input);
      const svg = root.querySelector("svg");
      if (!svg) throw new Error("No SVG element found");
      svg.tagName = "symbol";
      svg.setAttribute("id", iconName(file));
      svg.removeAttribute("xmlns");
      svg.removeAttribute("xmlns:xlink");
      svg.removeAttribute("version");
      svg.removeAttribute("width");
      svg.removeAttribute("height");
      return svg.toString().trim();
    })
  );
  let output = [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<!-- This file is generated by npm run build:icons -->`,
    `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="0" height="0">`,
    `<defs>`,
    ...symbols,
    `</defs>`,
    `</svg>`,
    "", // trailing newline
  ].join("\n");

  if (shouldOptimize) {
    const config = (await loadConfig()) || undefined;
    output = optimize(output, config).data;
  }

  return writeIfChanged(outputPath, output);
}
async function writeIfChanged(filepath, newContent) {
  const currentContent = await fs.readFile(filepath, "utf8").catch(() => "");
  if (currentContent === newContent) return false;
  await fs.writeFile(filepath, newContent, "utf8");
  return true;
}
