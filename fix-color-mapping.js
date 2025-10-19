const fs = require('fs');
const files = [
  'src/server/services/page-builder/exporters/gutenberg-exporter.ts',
  'src/server/services/page-builder/exporters/divi-exporter.ts',
  'src/server/services/page-builder/exporters/bricks-exporter.ts',
  'src/server/services/page-builder/exporters/oxygen-exporter.ts'
];

files.forEach(file => {
  let content = fs.readFileSync(file, 'utf8');
  
  // Fix semantic color mappings (ColorDefinition to string)
  content = content.replace(/palette\.semantic\.success,/g, 'palette.semantic.success?.hex,');
  content = content.replace(/palette\.semantic\.warning,/g, 'palette.semantic.warning?.hex,');
  content = content.replace(/palette\.semantic\.error,/g, 'palette.semantic.error?.hex,');
  content = content.replace(/palette\.semantic\.info,/g, 'palette.semantic.info?.hex,');
  
  content = content.replace(/palette\.semantic\.success\)/g, 'palette.semantic.success?.hex)');
  content = content.replace(/palette\.semantic\.warning\)/g, 'palette.semantic.warning?.hex)');
  content = content.replace(/palette\.semantic\.error\)/g, 'palette.semantic.error?.hex)');
  content = content.replace(/palette\.semantic\.info\)/g, 'palette.semantic.info?.hex)');
  
  fs.writeFileSync(file, content, 'utf8');
  console.log(`Fixed: ${file}`);
});
