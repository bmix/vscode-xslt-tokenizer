import * as vscode from 'vscode';
import {XslLexer, LanguageConfiguration, GlobalInstructionData, GlobalInstructionType} from './xslLexer';
import {GlobalsProvider} from './globalsProvider';
import * as path from 'path';
import { XsltTokenDefinitions } from './xsltTokenDefintions';

interface ImportedGlobals {
	href: string,
	data: GlobalInstructionData[],
	error: boolean
}

interface GlobalsSummary {
	globals: ImportedGlobals[],
	hrefs: string[]
}

export class XsltDefinitionProvider implements vscode.DefinitionProvider, vscode.CompletionItemProvider {

	private readonly xslLexer: XslLexer;
	private gp = new GlobalsProvider();
	private readonly isXSLT: boolean;

	public constructor(xsltConfiguration: LanguageConfiguration) {
		this.isXSLT = xsltConfiguration.nativePrefix === 'xsl';
		this.xslLexer = new XslLexer(xsltConfiguration);
		this.xslLexer.provideCharLevelState = true;
	}

	public async provideDefinition(document: vscode.TextDocument, position: vscode.Position, token: vscode.CancellationToken): Promise<vscode.Location | undefined> {
		const allTokens = this.xslLexer.analyse(document.getText());
		const globalInstructionData = this.xslLexer.globalInstructionData;
		// Import/include XSLT - ensuring no duplicates
		let importedG: ImportedGlobals = {data: globalInstructionData, href: document.fileName, error: false};
		let importedGlobals1 = [importedG];
		let accumulatedHrefs: string[] = [importedG.href];


		let globalsSummary0: GlobalsSummary = {globals: importedGlobals1, hrefs: accumulatedHrefs};
		const maxImportLevel = 20;

		let processNestedGlobals = async () => {
			let level = 0;
			while (globalsSummary0.hrefs.length > 0 && level < maxImportLevel) {
				globalsSummary0 = await this.processImportedGlobals(globalsSummary0.globals, accumulatedHrefs, level === 0);
				level++;
			}
		};

		await processNestedGlobals();

		return new Promise((resolve, reject) => {
			let location: vscode.Location|undefined = undefined;
			let allImportedGlobals: GlobalInstructionData[] = [];

			globalsSummary0.globals.forEach((globals) => {
				if (globals.error) {
					// ignore 
				} else {
					globals.data.forEach((global) => {
						global['href'] = globals.href;
						allImportedGlobals.push(global);
					});
				}		
			});


			location= XsltTokenDefinitions.findDefinition(this.isXSLT, document, allTokens, globalInstructionData, allImportedGlobals, position);

			resolve(location);
		});

	}

	public async provideCompletionItems(document: vscode.TextDocument, position: vscode.Position, token: vscode.CancellationToken): Promise<vscode.CompletionItem[] | undefined> {
		const allTokens = this.xslLexer.analyse(document.getText());
		const globalInstructionData = this.xslLexer.globalInstructionData;
		// Import/include XSLT - ensuring no duplicates
		let importedG: ImportedGlobals = {data: globalInstructionData, href: document.fileName, error: false};
		let importedGlobals1 = [importedG];
		let accumulatedHrefs: string[] = [importedG.href];


		let globalsSummary0: GlobalsSummary = {globals: importedGlobals1, hrefs: accumulatedHrefs};
		const maxImportLevel = 20;

		let processNestedGlobals = async () => {
			let level = 0;
			while (globalsSummary0.hrefs.length > 0 && level < maxImportLevel) {
				globalsSummary0 = await this.processImportedGlobals(globalsSummary0.globals, accumulatedHrefs, level === 0);
				level++;
			}
		};

		await processNestedGlobals();

		return new Promise((resolve, reject) => {
			let result: vscode.CompletionItem[]|undefined = undefined;
			let allImportedGlobals: GlobalInstructionData[] = [];

			globalsSummary0.globals.forEach((globals) => {
				if (globals.error) {
					// ignore 
				} else {
					globals.data.forEach((global) => {
						global['href'] = globals.href;
						allImportedGlobals.push(global);
					});
				}		
			});


			//location= XsltTokenDefinitions.findDefinition(this.isXSLT, document, allTokens, globalInstructionData, allImportedGlobals, position);

			resolve(result);
		});

	}

	private async processImportedGlobals(importedGlobals1: ImportedGlobals[], level1Hrefs: string[], topLevel: boolean): Promise<GlobalsSummary> {
		let level2Globals: Promise<ImportedGlobals[]>[] = [];
		let level2Hrefs = this.accumulateImportHrefs(importedGlobals1, level1Hrefs);
		let newGlobals: ImportedGlobals[] = [];

		level2Hrefs.forEach((href) => {
			level2Globals.push(this.fetchImportedGlobals([href]));
		});
		let importedGlobals2Array = await Promise.all(level2Globals);
		importedGlobals2Array.forEach((importedGlobals2) => {
			if (topLevel) {
				newGlobals = newGlobals.concat(importedGlobals2);
			} else {
				importedGlobals1 = importedGlobals1.concat(importedGlobals2);
			}
		});

		if (topLevel) {
			return {globals: newGlobals, hrefs: level2Hrefs};
		} else {
			return {globals: importedGlobals1, hrefs: level2Hrefs};
		}
	}

	private accumulateImportHrefs(importedGlobals: ImportedGlobals[], existingHrefs: string[]): string[] {
		let result: string[] = [];
		importedGlobals.forEach((importedG) => {
			importedG.data.forEach((data) => {
				if (data.type === GlobalInstructionType.Import || data.type === GlobalInstructionType.Include) {
					let resolvedName = this.resolvePath(data.name, importedG.href);
					if (existingHrefs.indexOf(resolvedName) < 0) {
						existingHrefs.push(resolvedName);
						result.push(resolvedName);
					}
				}
			});
		});
		return result;
	}

	private resolvePath(href: string, documentPath: string) {

		if (path.isAbsolute(href)) {
			return href;
		} else {
			let basePath = path.dirname(documentPath);
			let joinedPath = path.join(basePath, href);
			return path.normalize(joinedPath);
		}
	}

	private async fetchImportedGlobals(inputHrefs: string[]): Promise<ImportedGlobals[]> {
		let result: ImportedGlobals[] = [];
		//let inputHrefs: string[] = this.accumulateImportHrefs(globalInstructionData, existingHrefs, docHref);
		let lastIndex = inputHrefs.length - 1;
		if (lastIndex < 0) {
			return result;
		} else {
			return new Promise((resolve, reject) => {
				inputHrefs.forEach((href, index) => {
					this.gp.provideGlobals(href).then((globals) => {
						result.push({href: href, data: globals.data, error: globals.error});
						if (index === lastIndex) {
							resolve(result);
						}
					});
				});
			});
		}
	}
}