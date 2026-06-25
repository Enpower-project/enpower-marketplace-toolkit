const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// Directorio raíz del proyecto: un nivel arriba del directorio scripts
// Este script asume que está en: project_root/scripts/compile.js
// Por lo tanto, project_root está un nivel arriba
const PROJECT_ROOT = path.resolve(__dirname, '..');

console.log(`📍 Directorio raíz del proyecto: ${PROJECT_ROOT}`);

function deleteFolderRecursive(folderPath) {
    const fullPath = path.join(PROJECT_ROOT, folderPath);
    console.log(`🔍 Verificando: ${fullPath}`);
    if (fs.existsSync(fullPath)) {
        console.log(`✅ Existe: ${fullPath}`);
        fs.readdirSync(fullPath).forEach((file) => {
            const curPath = path.join(fullPath, file);
            if (fs.lstatSync(curPath).isDirectory()) {
                deleteFolderRecursive(path.relative(PROJECT_ROOT, curPath));
            } else {
                fs.unlinkSync(curPath);
            }
        });
        fs.rmdirSync(fullPath);
        console.log(`🗑️ Borrado: ${fullPath}`);
    } else {
        console.log(`⚠️ No existe: ${fullPath}`);
    }
}

async function main() {
    const foldersToDelete = [
        'artifacts',
    ];

    console.log('🔄 Limpiando carpetas...');
    foldersToDelete.forEach(deleteFolderRecursive);

    const artifactsPath = path.join(PROJECT_ROOT, 'artifacts');
    console.log('📁 Asegurando que exista el directorio artifacts...');
    if (!fs.existsSync(artifactsPath)) {
        fs.mkdirSync(artifactsPath, { recursive: true });
        console.log(`✅ Directorio artifacts creado en: ${artifactsPath}`);
    } else {
        console.log(`✅ Directorio artifacts ya existe en: ${artifactsPath}`);
    }

    console.log('🔨 Compilando contratos...');
    try {
        execSync('npx hardhat compile', { stdio: 'inherit', cwd: PROJECT_ROOT });
        console.log('✅ Compilación exitosa.');
    } catch (error) {
        console.error('❌ Error en la compilación:', error.message);
    }
}

main();
