import * as vscode from 'vscode';
import {XslLexer, LanguageConfiguration, GlobalInstructionData, GlobalInstructionType, DocumentTypes} from './xslLexer';
import {XsltTokenDiagnostics} from './xsltTokenDiagnostics';
import {GlobalsProvider} from './globalsProvider';
import * as path from 'path';

interface ImportedGlobals {
	href: string,
	data: GlobalInstructionData[],
	error: boolean
}

interface GlobalsSummary {
	globals: ImportedGlobals[],
	hrefs: string[]
}

export interface XsltPackage {
	name: string,
	path: string,
	version?: string
}

export class XsltSymbolProvider implements vscode.DocumentSymbolProvider {

	private readonly xslLexer: XslLexer;
	private readonly collection: vscode.DiagnosticCollection;
	private gp = new GlobalsProvider();
	private readonly languageConfig: LanguageConfiguration;
	private docType: DocumentTypes;

	public constructor(xsltConfiguration: LanguageConfiguration, collection: vscode.DiagnosticCollection) {
		this.xslLexer = new XslLexer(xsltConfiguration);
		this.xslLexer.provideCharLevelState = true;
		this.collection = collection;
		this.languageConfig = xsltConfiguration;
		this.docType = xsltConfiguration.docType;
	}

	public async provideDocumentSymbols(document: vscode.TextDocument, token: vscode.CancellationToken): Promise<vscode.DocumentSymbol[] | undefined> {
		const allTokens = this.xslLexer.analyse(document.getText());
		const globalInstructionData = this.xslLexer.globalInstructionData;
		const xsltPackages: XsltPackage[] = <XsltPackage[]>vscode.workspace.getConfiguration('XSLT.resources').get('xsltPackages');

		// Import/include XSLT - ensuring no duplicates
		let importedG: ImportedGlobals = {data: globalInstructionData, href: document.fileName, error: false};
		let importedGlobals1 = [importedG];
		let accumulatedHrefs: string[] = [importedG.href];
		let topLevelHrefs = this.accumulateImportHrefs(xsltPackages, importedGlobals1, []);


		let globalsSummary0: GlobalsSummary = {globals: importedGlobals1, hrefs: accumulatedHrefs};
		const maxImportLevel = 20;

		let processNestedGlobals = async () => {
			let level = 0;
			while (globalsSummary0.hrefs.length > 0 && level < maxImportLevel) {
				globalsSummary0 = await this.processImportedGlobals(xsltPackages, globalsSummary0.globals, accumulatedHrefs, level === 0);
				level++;
			}
		};

		await processNestedGlobals();

		return new Promise((resolve, reject) => {
			let symbols: vscode.DocumentSymbol[] = [];
			let allImportedGlobals: GlobalInstructionData[] = [];
			let importErrors: GlobalInstructionData[] = [];
			const rootPath = vscode.workspace.rootPath;

			globalsSummary0.globals.forEach((globals) => {
				if (globals.error) {
					if (topLevelHrefs.indexOf(globals.href) > -1) {
						let errorData = globalInstructionData.find((dataObject) => {
							let result = false;
							if (dataObject.type === GlobalInstructionType.Import || dataObject.type === GlobalInstructionType.Include) {
								let resolvedName = this.resolvePath(dataObject.name, document.fileName);
								result = resolvedName === globals.href;
							} else if (dataObject.type === GlobalInstructionType.UsePackage) {
								// TODO:
								const basePath = path.dirname(document.fileName);
								let packageLookup = xsltPackages.find((pkg) => {
									return pkg.name === dataObject.name;
								});
								if (packageLookup && rootPath) {
									let resolvedName = XsltSymbolProvider.resolvePathInSettings(packageLookup.path, rootPath);
									result = resolvedName === globals.href;
								} else {
									result = false;
								}

							}
							return result;
						});
						if (errorData) {
							importErrors.push(errorData);
						}
					}
				} else {
					globals.data.forEach((global) => {
						global['href'] = globals.href;
						allImportedGlobals.push(global);
					});
				}		
			});

			let importDiagnostics: vscode.Diagnostic[] = [];
			importErrors.forEach((importError) => {
				importDiagnostics.push(XsltTokenDiagnostics.createImportDiagnostic(importError));
			});

			let diagnostics = XsltTokenDiagnostics.calculateDiagnostics(this.languageConfig, this.docType, document, allTokens, globalInstructionData, allImportedGlobals, symbols);
			let allDiagnostics = importDiagnostics.concat(diagnostics);
			if (allDiagnostics.length > 0) {
				this.collection.set(document.uri, allDiagnostics);
			} else {
				this.collection.clear();
			};
			resolve(symbols);
		});

	}

	private async processImportedGlobals(xsltPackages: XsltPackage[], importedGlobals1: ImportedGlobals[], level1Hrefs: string[], topLevel: boolean): Promise<GlobalsSummary> {
		let level2Globals: Promise<ImportedGlobals[]>[] = [];
		let level2Hrefs = this.accumulateImportHrefs(xsltPackages, importedGlobals1, level1Hrefs);
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

	private accumulateImportHrefs(xsltPackages: XsltPackage[],importedGlobals: ImportedGlobals[], existingHrefs: string[]): string[] {
		let result: string[] = [];
		const rootPath = vscode.workspace.rootPath;
		importedGlobals.forEach((importedG) => {
			importedG.data.forEach((data) => {
				if (data.type === GlobalInstructionType.Import || data.type === GlobalInstructionType.Include) {
					let resolvedName = this.resolvePath(data.name, importedG.href);
					if (existingHrefs.indexOf(resolvedName) < 0) {
						existingHrefs.push(resolvedName);
						result.push(resolvedName);
					}
				} else if (rootPath && data.type === GlobalInstructionType.UsePackage) {
					let packageLookup = xsltPackages.find((pkg) => {
						return pkg.name === data.name;
					});
					if (packageLookup) {
						let resolvedName = XsltSymbolProvider.resolvePathInSettings(packageLookup.path, rootPath);
						if (existingHrefs.indexOf(resolvedName) < 0) {
							existingHrefs.push(resolvedName);
							result.push(resolvedName);
						}
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

	public static resolvePathInSettings(href: string, workspace: string) {

		if (path.isAbsolute(href)) {
			return href;
		} else {
			let joinedPath = path.join(workspace, href);
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