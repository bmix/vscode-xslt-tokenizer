import * as vscode from 'vscode';
import {XslLexer, LanguageConfiguration, GlobalInstructionData, GlobalInstructionType} from './xslLexer';
import {XsltTokenDiagnostics} from './xsltTokenDiagnostics';
import {GlobalsProvider} from './globalsProvider';
import * as path from 'path';
import { promises } from 'dns';


interface ImportedGlobals {
	href: string,
	data: GlobalInstructionData[]
}

export class XsltSymbolProvider implements vscode.DocumentSymbolProvider {

	private readonly xslLexer: XslLexer;
	private readonly collection: vscode.DiagnosticCollection;
	private gp = new GlobalsProvider();

	public constructor(xsltConfiguration: LanguageConfiguration, collection: vscode.DiagnosticCollection) {
		this.xslLexer = new XslLexer(xsltConfiguration);
		this.xslLexer.provideCharLevelState = true;
		this.collection = collection;
	}

	public async provideDocumentSymbols(document: vscode.TextDocument, token: vscode.CancellationToken): Promise<vscode.DocumentSymbol[] | undefined> {
		// console.log('provideDocumentSymbols: ' + document.uri);
		const allTokens = this.xslLexer.analyse(document.getText());
		const globalInstructionData = this.xslLexer.globalInstructionData;

		// TODO: import recursively if imports include imports etc.
		let fullDocPath = document.fileName;
		let startLoop = true;
		let existingHrefs: string[] = []
		let importedGlobals1 = await this.fetchImportedGlobals(globalInstructionData, existingHrefs, fullDocPath);


		let importedGlobals2 = await this.fetchImportedGlobals(globalInstructionData, [], fullDocPath);
		await Promise.all([importedGlobals1, importedGlobals2]);


		return new Promise((resolve, reject) => {
			let symbols: vscode.DocumentSymbol[] = [];
			console.log(importedGlobals);
			let diagnostics = XsltTokenDiagnostics.calculateDiagnostics(document, allTokens, globalInstructionData, symbols);
			if (diagnostics.length > 0) {
				this.collection.set(document.uri, diagnostics);
			} else {
				this.collection.clear();
			};
			resolve(symbols);
		});

	}


	private accumulateImportHrefs(globalInstructionData: GlobalInstructionData[], existingHrefs: string[], docHref: string): string[] {
		let result: string[] = [];
		globalInstructionData.forEach((data) => {
			if (data.type === GlobalInstructionType.Import || data.type === GlobalInstructionType.Include) {
				let resolvedName = this.resolvePath(data.name, docHref);
				if (existingHrefs.indexOf(resolvedName) < 0) {
					result.push(resolvedName);
				}
			}
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

	private async fetchImportedGlobals(globalInstructionData: GlobalInstructionData[], existingHrefs: string[], docHref: string): Promise<ImportedGlobals[]> {
		let result: ImportedGlobals[] = [];
		let inputHrefs: string[] = this.accumulateImportHrefs(globalInstructionData, existingHrefs, docHref);
		let lastIndex = inputHrefs.length - 1;
		if (lastIndex < 0) {
			return result;
		} else {
			return new Promise((resolve, reject) => {
				inputHrefs.forEach((href, index) => {
					this.gp.provideGlobals(href).then((globals) => {
						result.push({href: href, data: globals});
						if (index === lastIndex) {
							resolve(result);
						}
					});
				});
			});
		}
	}
}