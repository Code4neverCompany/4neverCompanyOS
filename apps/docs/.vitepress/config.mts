import { defineConfig } from 'vitepress'

export default defineConfig({
  title: '4neverCompany OS',
  description: 'Desktop workspace bundling Paperclip + Hermes Agent + BMAD Method',
  srcDir: '.',
  ignoreDeadLinks: true,
  head: [
    ['link', { rel: 'icon', href: '/favicon.ico' }]
  ],
  themeConfig: {
    nav: [
      { text: 'Install', link: '/install/' },
      { text: 'First Run', link: '/first-run/' },
      { text: 'Getting Started', link: '/getting-started/' },
      { text: 'Personas', link: '/personas/' },
      { text: 'BMAD Workflows', link: '/bmad/' },
      { text: 'Multi-Machine', link: '/multi-machine/' },
      { text: 'Troubleshooting', link: '/troubleshooting/' }
    ],
    sidebar: {
      '/install/': [
        { text: 'Install', items: [
          { text: 'Windows', link: '/install/windows' },
          { text: 'macOS', link: '/install/macos' },
          { text: 'Linux', link: '/install/linux' }
        ]},
        { text: 'Build from Source', link: '/install/build' }
      ],
      '/first-run/': [
        { text: 'First Run Wizard', link: '/first-run/' }
      ],
      '/getting-started/': [
        { text: 'Starting a Project', link: '/getting-started/' },
        { text: 'BMAD Project', link: '/bmad/' },
        { text: 'Adding a Persona', link: '/personas/add' },
        { text: 'Custom Persona', link: '/personas/custom' }
      ],
      '/personas/': [
        { text: 'Personas Overview', link: '/personas/' },
        { text: 'Adding a Persona', link: '/personas/add' },
        { text: 'Creating a Custom Persona', link: '/personas/custom' }
      ],
      '/bmad/': [
        { text: 'BMAD Workflows', link: '/bmad/' }
      ],
      '/multi-machine/': [
        { text: 'Multi-Machine Setup', link: '/multi-machine/' }
      ],
      '/troubleshooting/': [
        { text: 'Troubleshooting', link: '/troubleshooting/' }
      ]
    },
    socialLinks: [
      { icon: 'github', link: 'https://github.com/Code4neverCompany/4neverCompanyOS' }
    ]
  }
})
