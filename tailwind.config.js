/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
    './src/context/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        bg:      '#0d1117',
        panel:   '#161b22',
        card:    '#1c2128',
        border:  '#30363d',
        accent:  '#238636',
        accent2: '#1f6feb',
        good:    '#3fb950',
        warn:    '#d29922',
        danger:  '#da3633',
        muted:   '#8b949e',
        txt:     '#e6edf3',
      },
    },
  },
  plugins: [],
};
