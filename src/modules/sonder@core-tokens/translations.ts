const files = import.meta.glob<Record<string, unknown>>('./translations/*.json', { eager: true, import: 'default' })

export default Object.fromEntries(Object.entries(files).map(([path, messages]) => [path.match(/([\w-]+)\.json$/)![1], messages]))
