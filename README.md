# SVG Icons CLI

> A command line tool for creating SVG spirte sheets and rendering them with a React Icon component. Based on "[Use svg sprite icons in React](https://www.jacobparis.com/content/svg-icons)" by Jacob Paris and the [Epic Stack](https://github.com/epicweb-dev/epic-stack)

## The Problem

Including SVGs in your JavaScript bundles is convenient, but [slow and expensive](https://x.com/_developit/status/1382838799420514317?s=20). Using `<img>` tags with SVGs isn't flexible. The best way to use icons is an SVG spritesheet, but there isn't an out-of-the-box tool to create those spritesheets.

## The Solution

A CLI tool that

- Sets you up with a TypeScript-ready, Tailwind-ready `<Icon>` component
- Automatically generates an SVG sprite sheet for you

## Installation

The `icons` CLI can be installed as a dev dependency.

```bash
npm install --save-dev svg-icons-cli
```

And then use it in your package.json

````json
{
  "scripts": {
    "build:icons": "icons build"
  }
}

or call it directly with `npx`

```bash
npx svg-icons-cli build
````

## Usage

The CLI has two commands: `init` for creating an `<Icon>` React component inside your app, and `build` for generating an SVG sprite sheet.

### `init`

This command installs a Tailwind-compatible `<Icon>` component in your app. If you're using TypeScript, it will also install a default type definition file which is used by TypeScript before a more exact type definition file is generated by the `build` command.

Run it with no options to interactively set your options. It will automatically guess the values based on which framework you're using (Remix, Next.js, or Vite), and whether you're using TypeScript.

```bash
npx svg-icons-cli init
```

#### Options

- `-o, --output`: Where to store the Icon component. Defaults to `components/ui`
- `-t, --types`: Where to store the default type definition file. Defaults to `types/icon-name.d.ts`

> [!NOTE] > **Why not export `<Icon>` from this package?**
>
> The `<Icon>` component is built using Tailwind classes, which is my preferred way to write CSS. Your app might use your own classes, CSS modules, or some other styling method. Instead of shipping a million different implementations, the CLI will put a small component in your app that you can modify to your hearts content. Or, you can follow the manual installation instructions below.

#### Manual Installation

First, copy/paste one of these components into your project:

<details><summary>Icon.tsx</summary>

```tsx
import { type SVGProps } from "react";
// Configure this path in your tsconfig.json
import { type IconName } from "~/icon-name";
import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";
import href from "./icons/sprite.svg";

export { href };

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
        className={`inline-flex items-center ${childrenSizeClassName[size]}`}
      >
        <Icon name={name} size={size} className={className} {...props} />
        {children}
      </span>
    );
  }
  return (
    <svg
      {...props}
      className={twMerge(
        clsx(sizeClassName[size], "inline self-center", className)
      )}
    >
      <use href={`${href}#${name}`} />
    </svg>
  );
}
```

</details>

<details><summary>Icon.jsx</summary>

```jsx
import { clsx } from "clsx";
import { twMerge } from "tailwind-merge";
import href from "./icons/sprite.svg";

export { href };
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
```

</details>

Install the dependencies.

```bash
npm install --save tailwind-merge clsx
```

If you're using TypeScript, add a default type definition file.

```ts
// types/icon-name.d.ts
// This file is a fallback until you run npm run icons build

export type IconName = string;
```

And set up your paths in tsconfig.json

```json
"paths": {
  "~/icon-name": ["${iconsOutput}/name.d.ts", "${types}"]
}
```

Then add some icons and run the `build` CLI command, making sure your output folder matches the `href` in your `Icon` component.

Import your `<Icon>` component and pass an icon name and optionally a `size` or `className`.

```jsx
<button aria-label="Take a picture">
  <Icon name="camera" size="sm" />
</button>
```

### `build`

This command takes an input folder and an output folder, combines all the SVG files in the input folder, and puts an SVG sprite sheet and `icon-names.d.ts` file inside the output folder.

Run it with no options to interactively set your options. It will automatically guess the values based on which framework you're using (Remix, Next.js, or Vite). The CLI will also print the appropriate command that you can copy/paste and reuse - you should consider putting the command into a package.json script so you don't have to type it every time.

```bash
npx svg-icons-cli build
```

#### Options

- `-i, --input`: The folder where the source SVG icons are stored
- `-o, --output`: Where to output the sprite sheet and types

> [!TIP]
> We recommend using the [Sly CLI](https://sly-cli.fly.dev) to bring icons into your project. It can be configured with many icon repositories, and can run the build command after new icons have been added.

## Contributing

This project was thrown together in a few hours, and works great if you follow the happy path. That said, there's a lot possible contributions that would be welcome.

- [ ] File issues to suggest how the project could be better.
- [ ] Improve this documentation.
- [ ] Make non-React `<Icon>` components for different frameworks.
- [ ] Automatically add the `build` script to `package.json` when `init` is run.
- [ ] Automatically update `tsconfig.json` when `init` is run.
- [ ] Add Github Actions to automatically publish to NPM when pushed to `main`.

Bun is used to install dependencies, but the project works just fine in Node.js too.

PRs welcome!