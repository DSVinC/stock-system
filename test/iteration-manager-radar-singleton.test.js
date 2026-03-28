/**
 * 测试 iteration-manager.html 雷达图单例模式
 * 验证 Chart.js 不会出现 "Canvas is already in use" 错误
 */

const fs = require('fs');
const path = require('path');

const HTML_FILE = path.join(__dirname, '..', 'iteration-manager.html');

function runTests() {
  let htmlContent;
  let passed = 0;
  let failed = 0;

  try {
    htmlContent = fs.readFileSync(HTML_FILE, 'utf-8');
  } catch (err) {
    console.error('❌ 无法读取文件:', HTML_FILE);
    process.exit(1);
  }

  console.log('='.repeat(60));
  console.log('iteration-manager.html 雷达图单例测试');
  console.log('='.repeat(60));

  // 测试1: HTML 中只存在一个 id="scoreRadar" canvas
  {
    const name = 'HTML 中只存在一个 id="scoreRadar" canvas';
    const canvasMatches = htmlContent.match(/id="scoreRadar"/g);
    if (canvasMatches && canvasMatches.length === 1) {
      console.log(`✅ ${name}`);
      passed++;
    } else {
      console.log(`❌ ${name}`);
      console.log(`   期望: 1 个, 实际: ${canvasMatches ? canvasMatches.length : 0} 个`);
      failed++;
    }
  }

  // 测试2: 只存在一套有效的雷达图初始化入口 - initRadarChart 函数定义
  {
    const name = 'initRadarChart 函数只定义一次';
    const initRadarChartMatches = htmlContent.match(/function\s+initRadarChart\s*\(/g);
    if (initRadarChartMatches && initRadarChartMatches.length === 1) {
      console.log(`✅ ${name}`);
      passed++;
    } else {
      console.log(`❌ ${name}`);
      console.log(`   期望: 1 个, 实际: ${initRadarChartMatches ? initRadarChartMatches.length : 0} 个`);
      failed++;
    }
  }

  // 测试3: 只存在一套有效的雷达图初始化入口 - new Chart 调用
  {
    const name = 'new Chart() 只调用一次';
    const newChartMatches = htmlContent.match(/new\s+Chart\s*\(/g);
    if (newChartMatches && newChartMatches.length === 1) {
      console.log(`✅ ${name}`);
      passed++;
    } else {
      console.log(`❌ ${name}`);
      console.log(`   期望: 1 个, 实际: ${newChartMatches ? newChartMatches.length : 0} 个`);
      failed++;
    }
  }

  // 测试4: 不应存在重复的 radarConfig 定义
  {
    const name = '不应存在重复的 radarConfig 定义';
    const radarConfigMatches = htmlContent.match(/const\s+radarConfig\s*=/g);
    if (radarConfigMatches === null) {
      console.log(`✅ ${name}`);
      passed++;
    } else {
      console.log(`❌ ${name}`);
      console.log(`   期望: 0 个, 实际: ${radarConfigMatches.length} 个`);
      failed++;
    }
  }

  // 测试5: Chart.js 脚本只引入一次
  {
    const name = 'Chart.js 脚本只引入一次';
    const chartJsScriptMatches = htmlContent.match(/chart\.js['"]/g);
    if (chartJsScriptMatches && chartJsScriptMatches.length === 1) {
      console.log(`✅ ${name}`);
      passed++;
    } else {
      console.log(`❌ ${name}`);
      console.log(`   期望: 1 个, 实际: ${chartJsScriptMatches ? chartJsScriptMatches.length : 0} 个`);
      failed++;
    }
  }

  // 测试6: 雷达图初始化只绑定一次 load 事件
  {
    const name = '雷达图初始化只绑定一次 load 事件';
    const loadEventMatches = htmlContent.match(/addEventListener\s*\(\s*['"]load['"]/g);
    if (loadEventMatches && loadEventMatches.length === 1) {
      console.log(`✅ ${name}`);
      passed++;
    } else {
      console.log(`❌ ${name}`);
      console.log(`   期望: 1 个, 实际: ${loadEventMatches ? loadEventMatches.length : 0} 个`);
      failed++;
    }
  }

  // 测试7: radarChart 变量只声明一次
  {
    const name = 'radarChart 变量只声明一次';
    const radarChartDeclMatches = htmlContent.match(/let\s+radarChart\s*[=;]/g);
    if (radarChartDeclMatches && radarChartDeclMatches.length === 1) {
      console.log(`✅ ${name}`);
      passed++;
    } else {
      console.log(`❌ ${name}`);
      console.log(`   期望: 1 个, 实际: ${radarChartDeclMatches ? radarChartDeclMatches.length : 0} 个`);
      failed++;
    }
  }

  // 测试8: 不应存在 </html> 后的额外内容
  {
    const name = '不应存在 </html> 后的额外内容';
    const afterHtmlMatch = htmlContent.match(/<\/html>\s*$/);
    if (afterHtmlMatch) {
      console.log(`✅ ${name}`);
      passed++;
    } else {
      console.log(`❌ ${name}`);
      console.log(`   文件应在 </html> 后结束，但存在额外内容`);
      failed++;
    }
  }

  console.log('='.repeat(60));
  console.log(`结果: ${passed} 通过, ${failed} 失败`);
  console.log('='.repeat(60));

  process.exit(failed > 0 ? 1 : 0);
}

runTests();