/*--------------------------------------------------------------------------------------
 *  Copyright 2025 Glass Devtools, Inc. All rights reserved.
 *  Licensed under the Apache License, Version 2.0. See LICENSE.txt for more information.
 *--------------------------------------------------------------------------------------*/

import React, { forwardRef, MutableRefObject, useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { IInputBoxStyles, InputBox } from '../../../../../../../base/browser/ui/inputbox/inputBox.js';
import { defaultCheckboxStyles, defaultInputBoxStyles, defaultSelectBoxStyles } from '../../../../../../../platform/theme/browser/defaultStyles.js';
import { SelectBox } from '../../../../../../../base/browser/ui/selectBox/selectBox.js';
import { IDisposable } from '../../../../../../../base/common/lifecycle.js';
import { Checkbox } from '../../../../../../../base/browser/ui/toggle/toggle.js';

import { CodeEditorWidget } from '../../../../../../../editor/browser/widget/codeEditor/codeEditorWidget.js'
import { useAccessor } from './services.js';
import { ITextModel } from '../../../../../../../editor/common/model.js';
import { asCssVariable } from '../../../../../../../platform/theme/common/colorUtils.js';
import { inputBackground, inputForeground } from '../../../../../../../platform/theme/common/colorRegistry.js';
import { useFloating, autoUpdate, offset, flip, shift, size, autoPlacement } from '@floating-ui/react';


// type guard
const isConstructor = (f: any)
	: f is { new(...params: any[]): any } => {
	return !!f.prototype && f.prototype.constructor === f;
}

export const WidgetComponent = <CtorParams extends any[], Instance>({ ctor, propsFn, dispose, onCreateInstance, children, className }
	: {
		ctor: { new(...params: CtorParams): Instance } | ((container: HTMLDivElement) => Instance),
		propsFn: (container: HTMLDivElement) => CtorParams, // unused if fn
		onCreateInstance: (instance: Instance) => IDisposable[],
		dispose: (instance: Instance) => void,
		children?: React.ReactNode,
		className?: string
	}
) => {
	const containerRef = useRef<HTMLDivElement | null>(null);

	useEffect(() => {
		const instance = isConstructor(ctor) ? new ctor(...propsFn(containerRef.current!)) : ctor(containerRef.current!)
		const disposables = onCreateInstance(instance);
		return () => {
			disposables.forEach(d => d.dispose());
			dispose(instance)
		}
	}, [ctor, propsFn, dispose, onCreateInstance, containerRef])

	return <div ref={containerRef} className={className === undefined ? `w-full` : className}>{children}</div>
}

type GenerateNextOptions = (newPathText: string) => Option[]

type Option = {
	name: string,
	displayName: string,
} & (
		| { nextOptions: Option[], generateNextOptions?: undefined }
		| { nextOptions?: undefined, generateNextOptions: GenerateNextOptions }
		| { nextOptions?: undefined, generateNextOptions?: undefined }
	)


const getOptionsAtPath = (accessor: ReturnType<typeof useAccessor>, path: string[], newPathText: string) => {


	const allOptions: Option[] = [
		{
			name: 'files',
			displayName: 'files',
			generateNextOptions: () => [
				{ name: 'a.txt', displayName: 'a.txt', },
				{ name: 'b.txt', displayName: 'b.txt', },
				{ name: 'c.txt', displayName: 'c.txt', },
				{ name: 'd.txt', displayName: 'd.txt', },
				{ name: 'e.txt', displayName: 'e.txt', },
				{ name: 'f.txt', displayName: 'f.txt', },
				{ name: 'g.txt', displayName: 'g.txt', },
				{ name: '!a.txt', displayName: '!a.txt', },
				{ name: '!b.txt', displayName: '!b.txt', },
				{ name: '!c.txt', displayName: '!c.txt', },
				{ name: '!d.txt', displayName: '!d.txt', },
				{ name: '!e.txt', displayName: '!e.txt', },
				{ name: '!f.txt', displayName: '!f.txt', },
				{ name: '!g.txt', displayName: '!g.txt', },
			]
		},
		{
			name: 'folders',
			displayName: 'folders',
			nextOptions: [
				{ name: 'FOLDER', displayName: 'FOLDER', },
			]
		},
	]

	// follow the path in the optionsTree (until the last path element)

	let nextOptionsAtPath = allOptions
	let generateNextOptionsAtPath: GenerateNextOptions | undefined = undefined

	for (const pn of path) {

		const selectedOption = nextOptionsAtPath.find(o => o.name.toLowerCase() === pn.toLowerCase())

		if (!selectedOption) return;

		nextOptionsAtPath = selectedOption.nextOptions! // assume nextOptions exists until we hit the very last option (the path will never contain the last possible option)
		generateNextOptionsAtPath = selectedOption.generateNextOptions

	}


	if (generateNextOptionsAtPath) {
		nextOptionsAtPath = generateNextOptionsAtPath(newPathText)
	}

	const optionsAtPath = nextOptionsAtPath.filter(o => o.name.includes(newPathText))


	return optionsAtPath

}



export type TextAreaFns = { setValue: (v: string) => void, enable: () => void, disable: () => void }
type InputBox2Props = {
	initValue?: string | null;
	placeholder: string;
	multiline: boolean;
	fnsRef?: { current: null | TextAreaFns };
	className?: string;
	onChangeText?: (value: string) => void;
	onKeyDown?: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void;
	onFocus?: (e: React.FocusEvent<HTMLTextAreaElement>) => void;
	onBlur?: (e: React.FocusEvent<HTMLTextAreaElement>) => void;
	onChangeHeight?: (newHeight: number) => void;
}
export const VoidInputBox2 = forwardRef<HTMLTextAreaElement, InputBox2Props>(function X({ initValue, placeholder, multiline, fnsRef, className, onKeyDown, onFocus, onBlur, onChangeText }, ref) {


	// mirrors whatever is in ref
	const accessor = useAccessor()
	const toolsService = accessor.get('IToolsService')












	const textAreaRef = useRef<HTMLTextAreaElement | null>(null)
	const selectedOptionRef = useRef<HTMLDivElement>(null);
	const [isMenuOpen, setIsMenuOpen] = useState(false);

	const [path, setPath] = useState<string[]>([]);
	const [optionIdx, setOptionIdx] = useState<number>(0);
	const [options, setOptions] = useState<Option[]>([]);
	const [newPathText, setNewPathText] = useState<string>('');


	const insertTextAtCursor = (text: string) => {
		const textarea = textAreaRef.current;
		if (!textarea) return;

		// Focus the textarea first
		textarea.focus();

		// The most reliable way to simulate typing is to use execCommand
		// which will trigger all the appropriate native events
		document.execCommand('insertText', false, text);

		// React's onChange relies on a SyntheticEvent system
		// The best way to ensure it runs is to call callbacks directly
		if (onChangeText) {
			onChangeText(textarea.value);
		}
		adjustHeight();
	};



	const onSelectOption = () => {

		if (!options.length) { return; }

		const option = options[optionIdx];
		const newPath = [...path, option.name]
		const isLastOption = !option.generateNextOptions && !option.nextOptions

		setPath(newPath)
		setNewPathText('')
		setOptionIdx(0)
		if (isLastOption) {
			setIsMenuOpen(false)
			insertTextAtCursor(`TODO-${option.displayName}`)
		}
		else {
			setOptions(getOptionsAtPath(accessor, newPath, '') || [])
		}
	}

	const onRemoveOption = () => {
		const newPath = [...path.slice(0, path.length - 1)]
		setPath(newPath)
		setNewPathText('')
		setOptionIdx(0)
		setOptions(getOptionsAtPath(accessor, newPath, '') || [])
	}

	const onOpenOptionMenu = () => {
		setPath([])
		setNewPathText('')
		setIsMenuOpen(true);
		setOptionIdx(0);
		setOptions(getOptionsAtPath(accessor, [], '') || []);
	}
	const onCloseOptionMenu = () => {
		setIsMenuOpen(false);
	}

	const onNavigateUp = () => {
		if (options.length === 0) return;
		setOptionIdx((prevIdx) => (prevIdx - 1 + options.length) % options.length);
	}
	const onNavigateDown = () => {
		if (options.length === 0) return;
		setOptionIdx((prevIdx) => (prevIdx + 1) % options.length);
	}

	const onPathTextChange = (newStr: string) => {
		setNewPathText(newStr);
		setOptions(getOptionsAtPath(accessor, path, newStr) || []);

	}

	const onMenuKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
		if (e.key === 'ArrowUp') {
			onNavigateUp();
		} else if (e.key === 'ArrowDown') {
			onNavigateDown();
		} else if (e.key === 'ArrowLeft') {
			onSelectOption();
		} else if (e.key === 'ArrowRight') {
			onSelectOption();
		} else if (e.key === 'Enter') {
			onSelectOption();
		} else if (e.key === 'Escape') {
			onCloseOptionMenu()
		} else if (e.key === 'Backspace') {

			if (!newPathText) { // No text remaining
				if (path.length === 0) {
					onCloseOptionMenu()
				} else {
					onRemoveOption();
				}
			}
			else if (e.altKey || e.ctrlKey || e.metaKey) { // Ctrl+Backspace
				onPathTextChange('')
			}
			else { // Backspace
				onPathTextChange(newPathText.slice(0, -1))
			}
		} else if (e.key.length === 1) {
			if (e.altKey || e.ctrlKey || e.metaKey) { // Ctrl+letter
				// do nothing
			}
			else { // letter
				onPathTextChange(newPathText + e.key)
			}
		}

		e.preventDefault();
		e.stopPropagation();

	};

	// scroll the selected optionIdx into view on optionIdx and newPathText changes
	useEffect(() => {
		if (isMenuOpen && selectedOptionRef.current) {
			selectedOptionRef.current.scrollIntoView({
				behavior: 'instant',
				block: 'nearest',
				inline: 'nearest',
			});
		}
	}, [optionIdx, isMenuOpen, newPathText, selectedOptionRef]);



	const measureRef = useRef<HTMLDivElement>(null);
	const gapPx = 2
	const offsetPx = 2
	const {
		x,
		y,
		strategy,
		refs,
		middlewareData,
		update
	} = useFloating({
		open: isMenuOpen,
		onOpenChange: setIsMenuOpen,
		placement: 'top',

		middleware: [
			offset({ mainAxis: gapPx, crossAxis: offsetPx }),
			flip({
				boundary: document.body,
				padding: 8
			}),
			shift({
				boundary: document.body,
				padding: 8,
			}),
			size({
				apply({ availableHeight, elements, rects }) {
					const maxHeight = Math.min(availableHeight)

					Object.assign(elements.floating.style, {
						maxHeight: `${maxHeight}px`,
						overflowY: 'auto',
						// Ensure the width isn't constrained by the parent
						width: `${Math.max(
							rects.reference.width,
							measureRef.current?.offsetWidth ?? 0
						)}px`
					});
				},
				padding: 8,
				// Use viewport as boundary instead of any parent element
				boundary: document.body,
			}),
		],
		whileElementsMounted: autoUpdate,
		strategy: 'fixed',
	});
	useEffect(() => {
		if (!isMenuOpen) return;

		const handleClickOutside = (event: MouseEvent) => {
			const target = event.target as Node;
			const floating = refs.floating.current;
			const reference = refs.reference.current;

			// Check if reference is an HTML element before using contains
			const isReferenceHTMLElement = reference && 'contains' in reference;

			if (
				floating &&
				(!isReferenceHTMLElement || !reference.contains(target)) &&
				!floating.contains(target)
			) {
				setIsMenuOpen(false);
			}
		};

		document.addEventListener('mousedown', handleClickOutside);
		return () => document.removeEventListener('mousedown', handleClickOutside);
	}, [isMenuOpen, refs.floating, refs.reference]);



	const [isEnabled, setEnabled] = useState(true)

	const adjustHeight = useCallback(() => {
		const r = textAreaRef.current
		if (!r) return

		r.style.height = 'auto' // set to auto to reset height, then set to new height

		if (r.scrollHeight === 0) return requestAnimationFrame(adjustHeight)
		const h = r.scrollHeight
		const newHeight = Math.min(h + 1, 500) // plus one to avoid scrollbar appearing when it shouldn't
		r.style.height = `${newHeight}px`
	}, []);



	const fns: TextAreaFns = useMemo(() => ({
		setValue: (val) => {
			const r = textAreaRef.current
			if (!r) return
			r.value = val
			onChangeText?.(r.value)
			adjustHeight()
		},
		enable: () => { setEnabled(true) },
		disable: () => { setEnabled(false) },
	}), [onChangeText, adjustHeight])



	useEffect(() => {
		if (initValue)
			fns.setValue(initValue)
	}, [initValue])




	return <>
		<textarea
			autoFocus={false}
			ref={useCallback((r: HTMLTextAreaElement | null) => {
				if (fnsRef)
					fnsRef.current = fns

				refs.setReference(r)

				textAreaRef.current = r
				if (typeof ref === 'function') ref(r)
				else if (ref) ref.current = r
				adjustHeight()
			}, [fnsRef, fns, setEnabled, adjustHeight, ref, refs])}

			onFocus={onFocus}
			onBlur={onBlur}

			disabled={!isEnabled}

			className={`w-full resize-none max-h-[500px] overflow-y-auto text-void-fg-1 placeholder:text-void-fg-3 ${className}`}
			style={{
				// defaultInputBoxStyles
				background: asCssVariable(inputBackground),
				color: asCssVariable(inputForeground)
				// inputBorder: asCssVariable(inputBorder),
			}}

			onInput={useCallback((event: React.FormEvent<HTMLTextAreaElement>) => {
				const latestChange = (event.nativeEvent as InputEvent).data;

				if (latestChange === '@') {
					onOpenOptionMenu()
				}

			}, [onOpenOptionMenu, accessor])}

			onChange={useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
				const r = textAreaRef.current
				if (!r) return
				onChangeText?.(r.value)
				adjustHeight()
			}, [onChangeText, adjustHeight])}

			onKeyDown={useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {

				if (isMenuOpen) {
					onMenuKeyDown(e)
					return;
				}

				if (e.key === 'Enter') {
					// Shift + Enter when multiline = newline
					const shouldAddNewline = e.shiftKey && multiline
					if (!shouldAddNewline) e.preventDefault(); // prevent newline from being created
				}
				onKeyDown?.(e)
			}, [onKeyDown, onMenuKeyDown, multiline])}

			rows={1}
			placeholder={placeholder}
		/>
		{/* <div>{`idx ${optionIdx}`}</div> */}
		{isMenuOpen && (
			<div
				ref={refs.setFloating}
				className="z-[100] bg-void-bg-1 border-void-border-3 border rounded shadow-lg"
				style={{
					position: strategy,
					top: y ?? 0,
					left: x ?? 0,
					width: refs.reference.current instanceof HTMLElement ? refs.reference.current.offsetWidth : 0
				}}
				onWheel={(e) => e.stopPropagation()}
			>
				<div className="py-1">
					{/* Path navigation breadcrumbs */}
					<div className="px-2 py-1 text-void-fg-3 text-sm border-b border-void-border-3">
						{[...path, newPathText].join(' > ')}
					</div>

					{/* Options list */}
					{options.length === 0 ? (
						<div className="px-3 py-2 text-void-fg-3">No options available</div>
					) : (
						options.map((o, oIdx) => (
							<div
								ref={oIdx === optionIdx ? selectedOptionRef : null}

								key={o.name}
								className={`px-3 py-1.5 cursor-pointer bg-void-bg-2 ${oIdx === optionIdx ? 'bg-void-bg-2-hover' : ''}`}
								onClick={() => { onSelectOption(); }}
							>
								<div className="flex items-center">
									<span className="text-void-fg-1">{o.displayName}</span>
									{o.nextOptions || o.generateNextOptions ? (
										<svg className="ml-2 h-3 w-3 text-void-fg-3" viewBox="0 0 12 12" fill="none">
											<path
												d="M4.5 2.5L8 6L4.5 9.5"
												stroke="currentColor"
												strokeWidth="1.5"
												strokeLinecap="round"
												strokeLinejoin="round"
											/>
										</svg>
									) : null}
								</div>
							</div>
						))
					)}
				</div>
			</div>
		)}
	</>

})


export const VoidSimpleInputBox = ({ value, onChangeValue, placeholder, className, disabled, passwordBlur, compact, ...inputProps }: {
	value: string;
	onChangeValue: (value: string) => void;
	placeholder: string;
	className?: string;
	disabled?: boolean;
	compact?: boolean;
	passwordBlur?: boolean;
} & React.InputHTMLAttributes<HTMLInputElement>) => {

	return (
		<input
			value={value}
			onChange={(e) => onChangeValue(e.target.value)}
			placeholder={placeholder}
			disabled={disabled}
			// className='max-w-44 w-full border border-void-border-2 bg-void-bg-1 text-void-fg-3 text-root'
			// className={`w-full resize-none text-void-fg-1 placeholder:text-void-fg-3 px-2 py-1 rounded-sm
			className={`w-full resize-none bg-void-bg-1 text-void-fg-1 placeholder:text-void-fg-3 border border-void-border-2 focus:border-void-border-1
				${compact ? 'py-1 px-2' : 'py-2 px-4 '}
				rounded
				${disabled ? 'opacity-50 cursor-not-allowed' : ''}
				${className}`}
			style={{
				...passwordBlur && { WebkitTextSecurity: 'disc' },
				background: asCssVariable(inputBackground),
				color: asCssVariable(inputForeground)
			}}
			{...inputProps}
			type={undefined} // VS Code is doing some annoyingness that breaks paste if this is defined
		/>
	);
};


export const VoidInputBox = ({ onChangeText, onCreateInstance, inputBoxRef, placeholder, isPasswordField, multiline }: {
	onChangeText: (value: string) => void;
	styles?: Partial<IInputBoxStyles>,
	onCreateInstance?: (instance: InputBox) => void | IDisposable[];
	inputBoxRef?: { current: InputBox | null };
	placeholder: string;
	isPasswordField?: boolean;
	multiline: boolean;
}) => {

	const accessor = useAccessor()

	const contextViewProvider = accessor.get('IContextViewService')
	return <WidgetComponent
		ctor={InputBox}
		className='
			bg-void-bg-1
			@@void-force-child-placeholder-void-fg-1
		'
		propsFn={useCallback((container) => [
			container,
			contextViewProvider,
			{
				inputBoxStyles: {
					...defaultInputBoxStyles,
					inputForeground: "var(--vscode-foreground)",
					// inputBackground: 'transparent',
					// inputBorder: 'none',
				},
				placeholder,
				tooltip: '',
				type: isPasswordField ? 'password' : undefined,
				flexibleHeight: multiline,
				flexibleMaxHeight: 500,
				flexibleWidth: false,
			}
		] as const, [contextViewProvider, placeholder, multiline])}
		dispose={useCallback((instance: InputBox) => {
			instance.dispose()
			instance.element.remove()
		}, [])}
		onCreateInstance={useCallback((instance: InputBox) => {
			const disposables: IDisposable[] = []
			disposables.push(
				instance.onDidChange((newText) => onChangeText(newText))
			)
			if (onCreateInstance) {
				const ds = onCreateInstance(instance) ?? []
				disposables.push(...ds)
			}
			if (inputBoxRef)
				inputBoxRef.current = instance;

			return disposables
		}, [onChangeText, onCreateInstance, inputBoxRef])
		}
	/>
};





export const VoidSlider = ({
	value,
	onChange,
	size = 'md',
	disabled = false,
	min = 0,
	max = 7,
	step = 1,
	className = '',
	width = 200,
}: {
	value: number;
	onChange: (value: number) => void;
	disabled?: boolean;
	size?: 'xxs' | 'xs' | 'sm' | 'sm+' | 'md';
	min?: number;
	max?: number;
	step?: number;
	className?: string;
	width?: number;
}) => {
	// Calculate percentage for position
	const percentage = ((value - min) / (max - min)) * 100;

	// Handle track click
	const handleTrackClick = (e: React.MouseEvent<HTMLDivElement>) => {
		if (disabled) return;

		const rect = e.currentTarget.getBoundingClientRect();
		const clickPosition = e.clientX - rect.left;
		const trackWidth = rect.width;

		// Calculate new value
		const newPercentage = Math.max(0, Math.min(1, clickPosition / trackWidth));
		const rawValue = min + newPercentage * (max - min);

		// Special handling to ensure max value is always reachable
		if (rawValue >= max - step / 2) {
			onChange(max);
			return;
		}

		// Normal step calculation
		const steppedValue = Math.round((rawValue - min) / step) * step + min;
		const clampedValue = Math.max(min, Math.min(max, steppedValue));

		onChange(clampedValue);
	};

	// Helper function to handle thumb dragging that respects steps and max
	const handleThumbDrag = (moveEvent: MouseEvent, track: Element) => {
		if (!track) return;

		const rect = (track as HTMLElement).getBoundingClientRect();
		const movePosition = moveEvent.clientX - rect.left;
		const trackWidth = rect.width;

		// Calculate new value
		const newPercentage = Math.max(0, Math.min(1, movePosition / trackWidth));
		const rawValue = min + newPercentage * (max - min);

		// Special handling to ensure max value is always reachable
		if (rawValue >= max - step / 2) {
			onChange(max);
			return;
		}

		// Normal step calculation
		const steppedValue = Math.round((rawValue - min) / step) * step + min;
		const clampedValue = Math.max(min, Math.min(max, steppedValue));

		onChange(clampedValue);
	};

	return (
		<div className={`inline-flex items-center flex-shrink-0 ${className}`}>
			{/* Outer container with padding to account for thumb overhang */}
			<div className={`relative flex-shrink-0 ${disabled ? 'opacity-25' : ''}`}
				style={{
					width,
					// Add horizontal padding equal to half the thumb width
					// paddingLeft: thumbSizePx / 2,
					// paddingRight: thumbSizePx / 2
				}}>
				{/* Track container with adjusted width */}
				<div className="relative w-full">
					{/* Invisible wider clickable area that sits above the track */}
					<div
						className="absolute w-full cursor-pointer"
						style={{
							height: '16px',
							top: '50%',
							transform: 'translateY(-50%)',
							zIndex: 1
						}}
						onClick={handleTrackClick}
					/>

					{/* Track */}
					<div
						className={`relative ${size === 'xxs' ? 'h-0.5' :
							size === 'xs' ? 'h-1' :
								size === 'sm' ? 'h-1.5' :
									size === 'sm+' ? 'h-2' : 'h-2.5'
							} bg-void-bg-2 rounded-full cursor-pointer`}
						onClick={handleTrackClick}
					>
						{/* Filled part of track */}
						<div
							className={`absolute left-0 ${size === 'xxs' ? 'h-0.5' :
								size === 'xs' ? 'h-1' :
									size === 'sm' ? 'h-1.5' :
										size === 'sm+' ? 'h-2' : 'h-2.5'
								} bg-void-fg-1 rounded-full`}
							style={{ width: `${percentage}%` }}
						/>
					</div>

					{/* Thumb */}
					<div
						className={`absolute top-1/2 transform -translate-x-1/2 -translate-y-1/2
							${size === 'xxs' ? 'h-2 w-2' :
								size === 'xs' ? 'h-2.5 w-2.5' :
									size === 'sm' ? 'h-3 w-3' :
										size === 'sm+' ? 'h-3.5 w-3.5' : 'h-4 w-4'
							}
							bg-void-fg-1 rounded-full shadow-md ${disabled ? 'cursor-not-allowed' : 'cursor-grab active:cursor-grabbing'}
							border border-void-fg-1`}
						style={{ left: `${percentage}%`, zIndex: 2 }}  // Ensure thumb is above the invisible clickable area
						onMouseDown={(e) => {
							if (disabled) return;

							const track = e.currentTarget.previousElementSibling;

							const handleMouseMove = (moveEvent: MouseEvent) => {
								handleThumbDrag(moveEvent, track as Element);
							};

							const handleMouseUp = () => {
								document.removeEventListener('mousemove', handleMouseMove);
								document.removeEventListener('mouseup', handleMouseUp);
								document.body.style.cursor = '';
								document.body.style.userSelect = '';
							};

							document.body.style.userSelect = 'none';
							document.body.style.cursor = 'grabbing';
							document.addEventListener('mousemove', handleMouseMove);
							document.addEventListener('mouseup', handleMouseUp);

							e.preventDefault();
						}}
					/>
				</div>
			</div>
		</div>
	);
};



export const VoidSwitch = ({
	value,
	onChange,
	size = 'md',
	disabled = false,
	...props
}: {
	value: boolean;
	onChange: (value: boolean) => void;
	disabled?: boolean;
	size?: 'xxs' | 'xs' | 'sm' | 'sm+' | 'md';
}) => {
	return (
		<label className="inline-flex items-center" {...props}>
			<div
				onClick={() => !disabled && onChange(!value)}
				className={`
			cursor-pointer
			relative inline-flex items-center rounded-full transition-colors duration-200 ease-in-out
			${value ? 'bg-zinc-900 dark:bg-white' : 'bg-white dark:bg-zinc-600'}
			${disabled ? 'opacity-25' : ''}
			${size === 'xxs' ? 'h-3 w-5' : ''}
			${size === 'xs' ? 'h-4 w-7' : ''}
			${size === 'sm' ? 'h-5 w-9' : ''}
			${size === 'sm+' ? 'h-5 w-10' : ''}
			${size === 'md' ? 'h-6 w-11' : ''}
		  `}
			>
				<span
					className={`
			  inline-block transform rounded-full bg-white dark:bg-zinc-900 shadow transition-transform duration-200 ease-in-out
			  ${size === 'xxs' ? 'h-2 w-2' : ''}
			  ${size === 'xs' ? 'h-2.5 w-2.5' : ''}
			  ${size === 'sm' ? 'h-3 w-3' : ''}
			  ${size === 'sm+' ? 'h-3.5 w-3.5' : ''}
			  ${size === 'md' ? 'h-4 w-4' : ''}
			  ${size === 'xxs' ? (value ? 'translate-x-2.5' : 'translate-x-0.5') : ''}
			  ${size === 'xs' ? (value ? 'translate-x-3.5' : 'translate-x-0.5') : ''}
			  ${size === 'sm' ? (value ? 'translate-x-5' : 'translate-x-1') : ''}
			  ${size === 'sm+' ? (value ? 'translate-x-6' : 'translate-x-1') : ''}
			  ${size === 'md' ? (value ? 'translate-x-6' : 'translate-x-1') : ''}
			`}
				/>
			</div>
		</label>
	);
};





export const VoidCheckBox = ({ label, value, onClick, className }: { label: string, value: boolean, onClick: (checked: boolean) => void, className?: string }) => {
	const divRef = useRef<HTMLDivElement | null>(null)
	const instanceRef = useRef<Checkbox | null>(null)

	useEffect(() => {
		if (!instanceRef.current) return
		instanceRef.current.checked = value
	}, [value])


	return <WidgetComponent
		className={className ?? ''}
		ctor={Checkbox}
		propsFn={useCallback((container: HTMLDivElement) => {
			divRef.current = container
			return [label, value, defaultCheckboxStyles] as const
		}, [label, value])}
		onCreateInstance={useCallback((instance: Checkbox) => {
			instanceRef.current = instance;
			divRef.current?.append(instance.domNode)
			const d = instance.onChange(() => onClick(instance.checked))
			return [d]
		}, [onClick])}
		dispose={useCallback((instance: Checkbox) => {
			instance.dispose()
			instance.domNode.remove()
		}, [])}

	/>

}



export const VoidCustomDropdownBox = <T extends NonNullable<any>>({
	options,
	selectedOption,
	onChangeOption,
	getOptionDropdownName,
	getOptionDropdownDetail,
	getOptionDisplayName,
	getOptionsEqual,
	className,
	arrowTouchesText = true,
	matchInputWidth = false,
	gapPx = 0,
	offsetPx = -6,
}: {
	options: T[];
	selectedOption: T | undefined;
	onChangeOption: (newValue: T) => void;
	getOptionDropdownName: (option: T) => string;
	getOptionDropdownDetail?: (option: T) => string;
	getOptionDisplayName: (option: T) => string;
	getOptionsEqual: (a: T, b: T) => boolean;
	className?: string;
	arrowTouchesText?: boolean;
	matchInputWidth?: boolean;
	gapPx?: number;
	offsetPx?: number;
}) => {
	const [isOpen, setIsOpen] = useState(false);
	const measureRef = useRef<HTMLDivElement>(null);

	// Replace manual positioning with floating-ui
	const {
		x,
		y,
		strategy,
		refs,
		middlewareData,
		update
	} = useFloating({
		open: isOpen,
		onOpenChange: setIsOpen,
		placement: 'bottom-start',

		middleware: [
			offset({ mainAxis: gapPx, crossAxis: offsetPx }),
			flip({
				boundary: document.body,
				padding: 8
			}),
			shift({
				boundary: document.body,
				padding: 8,
			}),
			size({
				apply({ availableHeight, elements, rects }) {
					const maxHeight = Math.min(availableHeight)

					Object.assign(elements.floating.style, {
						maxHeight: `${maxHeight}px`,
						overflowY: 'auto',
						// Ensure the width isn't constrained by the parent
						width: `${Math.max(
							rects.reference.width,
							measureRef.current?.offsetWidth ?? 0
						)}px`
					});
				},
				padding: 8,
				// Use viewport as boundary instead of any parent element
				boundary: document.body,
			}),
		],
		whileElementsMounted: autoUpdate,
		strategy: 'fixed',
	});

	// if the selected option is null, set the selection to the 0th option
	useEffect(() => {
		if (options.length === 0) return
		if (selectedOption !== undefined) return
		onChangeOption(options[0])
	}, [selectedOption, onChangeOption, options])

	// Handle clicks outside
	useEffect(() => {
		if (!isOpen) return;

		const handleClickOutside = (event: MouseEvent) => {
			const target = event.target as Node;
			const floating = refs.floating.current;
			const reference = refs.reference.current;

			// Check if reference is an HTML element before using contains
			const isReferenceHTMLElement = reference && 'contains' in reference;

			if (
				floating &&
				(!isReferenceHTMLElement || !reference.contains(target)) &&
				!floating.contains(target)
			) {
				setIsOpen(false);
			}
		};

		document.addEventListener('mousedown', handleClickOutside);
		return () => document.removeEventListener('mousedown', handleClickOutside);
	}, [isOpen, refs.floating, refs.reference]);

	if (selectedOption === undefined)
		return null

	return (
		<div className={`inline-block relative ${className}`}>
			{/* Hidden measurement div */}
			<div
				ref={measureRef}
				className="opacity-0 pointer-events-none absolute -left-[999999px] -top-[999999px] flex flex-col"
				aria-hidden="true"
			>
				{options.map((option) => {
					const optionName = getOptionDropdownName(option);
					const optionDetail = getOptionDropdownDetail?.(option) || '';

					return (
						<div key={optionName + optionDetail} className="flex items-center whitespace-nowrap">
							<div className="w-4" />
							<span className="flex justify-between w-full">
								<span>{optionName}</span>
								<span>{optionDetail}</span>
								<span>______</span>
							</span>
						</div>
					)
				})}
			</div>

			{/* Select Button */}
			<button
				type='button'
				ref={refs.setReference}
				className="flex items-center h-4 bg-transparent whitespace-nowrap hover:brightness-90 w-full"
				onClick={() => setIsOpen(!isOpen)}
			>
				<span className={`truncate ${arrowTouchesText ? 'mr-1' : ''}`}>
					{getOptionDisplayName(selectedOption)}
				</span>
				<svg
					className={`size-3 flex-shrink-0 ${arrowTouchesText ? '' : 'ml-auto'}`}
					viewBox="0 0 12 12"
					fill="none"
				>
					<path
						d="M2.5 4.5L6 8L9.5 4.5"
						stroke="currentColor"
						strokeWidth="1.5"
						strokeLinecap="round"
						strokeLinejoin="round"
					/>
				</svg>
			</button>

			{/* Dropdown Menu */}
			{isOpen && (
				<div
					ref={refs.setFloating}
					className="z-[100] bg-void-bg-1 border-void-border-3 border rounded shadow-lg"
					style={{
						position: strategy,
						top: y ?? 0,
						left: x ?? 0,
						width: (matchInputWidth
							? (refs.reference.current instanceof HTMLElement ? refs.reference.current.offsetWidth : 0)
							: Math.max(
								(refs.reference.current instanceof HTMLElement ? refs.reference.current.offsetWidth : 0),
								(measureRef.current instanceof HTMLElement ? measureRef.current.offsetWidth : 0)
							))
					}}
					onWheel={(e) => e.stopPropagation()}
				><div className='overflow-auto max-h-80'>

						{options.map((option) => {
							const thisOptionIsSelected = getOptionsEqual(option, selectedOption);
							const optionName = getOptionDropdownName(option);
							const optionDetail = getOptionDropdownDetail?.(option) || '';

							return (
								<div
									key={optionName}
									className={`flex items-center px-2 py-1 pr-4 cursor-pointer whitespace-nowrap
									transition-all duration-100
									${thisOptionIsSelected ? 'bg-void-bg-2-hover' : 'bg-void-bg-2-alt hover:bg-void-bg-2-hover'}
								`}
									onClick={() => {
										onChangeOption(option);
										setIsOpen(false);
									}}
								>
									<div className="w-4 flex justify-center flex-shrink-0">
										{thisOptionIsSelected && (
											<svg className="size-3" viewBox="0 0 12 12" fill="none">
												<path
													d="M10 3L4.5 8.5L2 6"
													stroke="currentColor"
													strokeWidth="1.5"
													strokeLinecap="round"
													strokeLinejoin="round"
												/>
											</svg>
										)}
									</div>
									<span className="flex justify-between items-center w-full gap-x-1">
										<span>{optionName}</span>
										<span className='text-void-fg-4 opacity-60'>{optionDetail}</span>
									</span>
								</div>
							);
						})}
					</div>

				</div>
			)}
		</div>
	);
};



export const _VoidSelectBox = <T,>({ onChangeSelection, onCreateInstance, selectBoxRef, options, className }: {
	onChangeSelection: (value: T) => void;
	onCreateInstance?: ((instance: SelectBox) => void | IDisposable[]);
	selectBoxRef?: React.MutableRefObject<SelectBox | null>;
	options: readonly { text: string, value: T }[];
	className?: string;
}) => {
	const accessor = useAccessor()
	const contextViewProvider = accessor.get('IContextViewService')

	let containerRef = useRef<HTMLDivElement | null>(null);

	return <WidgetComponent
		className={`
			@@select-child-restyle
			@@[&_select]:!void-text-void-fg-3
			@@[&_select]:!void-text-xs
			!text-void-fg-3
			${className ?? ''}
		`}
		ctor={SelectBox}
		propsFn={useCallback((container) => {
			containerRef.current = container
			const defaultIndex = 0;
			return [
				options.map(opt => ({ text: opt.text })),
				defaultIndex,
				contextViewProvider,
				defaultSelectBoxStyles,
			] as const;
		}, [containerRef, options])}

		dispose={useCallback((instance: SelectBox) => {
			instance.dispose();
			containerRef.current?.childNodes.forEach(child => {
				containerRef.current?.removeChild(child)
			})
		}, [containerRef])}

		onCreateInstance={useCallback((instance: SelectBox) => {
			const disposables: IDisposable[] = []

			if (containerRef.current)
				instance.render(containerRef.current)

			disposables.push(
				instance.onDidSelect(e => { onChangeSelection(options[e.index].value); })
			)

			if (onCreateInstance) {
				const ds = onCreateInstance(instance) ?? []
				disposables.push(...ds)
			}
			if (selectBoxRef)
				selectBoxRef.current = instance;

			return disposables;
		}, [containerRef, onChangeSelection, options, onCreateInstance, selectBoxRef])}

	/>;
};

// makes it so that code in the sidebar isnt too tabbed out
const normalizeIndentation = (code: string): string => {
	const lines = code.split('\n')

	let minLeadingSpaces = Infinity

	// find the minimum number of leading spaces
	for (const line of lines) {
		if (line.trim() === '') continue;
		let leadingSpaces = 0;
		for (let i = 0; i < line.length; i++) {
			const char = line[i];
			if (char === '\t' || char === ' ') {
				leadingSpaces += 1;
			} else { break; }
		}
		minLeadingSpaces = Math.min(minLeadingSpaces, leadingSpaces)
	}

	// remove the leading spaces
	return lines.map(line => {
		if (line.trim() === '') return line;

		let spacesToRemove = minLeadingSpaces;
		let i = 0;
		while (spacesToRemove > 0 && i < line.length) {
			const char = line[i];
			if (char === '\t' || char === ' ') {
				spacesToRemove -= 1;
				i++;
			} else { break; }
		}

		return line.slice(i);

	}).join('\n')

}


const modelOfEditorId: { [id: string]: ITextModel | undefined } = {}
export type BlockCodeProps = { initValue: string, language?: string, maxHeight?: number, showScrollbars?: boolean }
export const BlockCode = ({ initValue, language, maxHeight, showScrollbars }: BlockCodeProps) => {

	initValue = normalizeIndentation(initValue)

	// default settings
	const MAX_HEIGHT = maxHeight ?? Infinity;
	const SHOW_SCROLLBARS = showScrollbars ?? false;

	const divRef = useRef<HTMLDivElement | null>(null)

	const accessor = useAccessor()
	const instantiationService = accessor.get('IInstantiationService')
	// const languageDetectionService = accessor.get('ILanguageDetectionService')
	const modelService = accessor.get('IModelService')

	const id = useId()

	// these are used to pass to the model creation of modelRef
	const initValueRef = useRef(initValue)
	const languageRef = useRef(language)

	const modelRef = useRef<ITextModel | null>(null)

	// if we change the initial value, don't re-render the whole thing, just set it here. same for language
	useEffect(() => {
		initValueRef.current = initValue
		modelRef.current?.setValue(initValue)
	}, [initValue])
	useEffect(() => {
		languageRef.current = language
		if (language) modelRef.current?.setLanguage(language)
	}, [language])

	return <div ref={divRef} className='relative z-0 px-2 py-1 bg-void-bg-3'>
		<WidgetComponent
			className='@@bg-editor-style-override' // text-sm
			ctor={useCallback((container) => {
				return instantiationService.createInstance(
					CodeEditorWidget,
					container,
					{
						automaticLayout: true,
						wordWrap: 'off',

						scrollbar: {
							alwaysConsumeMouseWheel: false,
							...SHOW_SCROLLBARS ? {
								vertical: 'auto',
								verticalScrollbarSize: 8,
								horizontal: 'auto',
								horizontalScrollbarSize: 8,
							} : {
								vertical: 'hidden',
								verticalScrollbarSize: 0,
								horizontal: 'auto',
								horizontalScrollbarSize: 8,
								ignoreHorizontalScrollbarInContentHeight: true,

							},
						},
						scrollBeyondLastLine: false,

						lineNumbers: 'off',

						readOnly: true,
						domReadOnly: true,
						readOnlyMessage: { value: '' },

						minimap: {
							enabled: false,
							// maxColumn: 0,
						},

						hover: { enabled: false },

						selectionHighlight: false, // highlights whole words
						renderLineHighlight: 'none',

						folding: false,
						lineDecorationsWidth: 0,
						overviewRulerLanes: 0,
						hideCursorInOverviewRuler: true,
						overviewRulerBorder: false,
						glyphMargin: false,

						stickyScroll: {
							enabled: false,
						},
					},
					{
						isSimpleWidget: true,
					})
			}, [instantiationService])}

			onCreateInstance={useCallback((editor: CodeEditorWidget) => {
				const languageId = languageRef.current ? languageRef.current : 'plaintext'

				const model = modelOfEditorId[id] ?? modelService.createModel(
					initValueRef.current, {
					languageId: languageId,
					onDidChange: (e) => { return { dispose: () => { } } } // no idea why they'd require this
				})
				modelRef.current = model
				editor.setModel(model);

				const container = editor.getDomNode()
				const parentNode = container?.parentElement
				const resize = () => {
					const height = editor.getScrollHeight() + 1
					if (parentNode) {
						// const height = Math.min(, MAX_HEIGHT);
						parentNode.style.height = `${height}px`;
						parentNode.style.maxHeight = `${MAX_HEIGHT}px`;
						editor.layout();
					}
				}

				resize()
				const disposable = editor.onDidContentSizeChange(() => { resize() });

				return [disposable, model]
			}, [modelService])}

			dispose={useCallback((editor: CodeEditorWidget) => {
				editor.dispose();
			}, [modelService])}

			propsFn={useCallback(() => { return [] }, [])}
		/>
	</div>

}


export const VoidButtonBgDarken = ({ children, disabled, onClick, className }: { children: React.ReactNode; disabled?: boolean; onClick: () => void; className?: string }) => {
	return <button disabled={disabled}
		className={`px-3 py-1 bg-black/10 dark:bg-white/10 rounded-sm overflow-hidden whitespace-nowrap flex items-center justify-center ${className || ''}`}
		onClick={onClick}
	>{children}</button>
}

// export const VoidScrollableElt = ({ options, children }: { options: ScrollableElementCreationOptions, children: React.ReactNode }) => {
// 	const instanceRef = useRef<DomScrollableElement | null>(null);
// 	const [childrenPortal, setChildrenPortal] = useState<React.ReactNode | null>(null)

// 	return <>
// 		<WidgetComponent
// 			ctor={DomScrollableElement}
// 			propsFn={useCallback((container) => {
// 				return [container, options] as const;
// 			}, [options])}
// 			onCreateInstance={useCallback((instance: DomScrollableElement) => {
// 				instanceRef.current = instance;
// 				setChildrenPortal(createPortal(children, instance.getDomNode()))
// 				return []
// 			}, [setChildrenPortal, children])}
// 			dispose={useCallback((instance: DomScrollableElement) => {
// 				console.log('calling dispose!!!!')
// 				// instance.dispose();
// 				// instance.getDomNode().remove()
// 			}, [])}
// 		>{children}</WidgetComponent>

// 		{childrenPortal}

// 	</>
// }

// export const VoidSelectBox = <T,>({ onChangeSelection, initVal, selectBoxRef, options }: {
// 	initVal: T;
// 	selectBoxRef: React.MutableRefObject<SelectBox | null>;
// 	options: readonly { text: string, value: T }[];
// 	onChangeSelection: (value: T) => void;
// }) => {


// 	return <WidgetComponent
// 		ctor={DropdownMenu}
// 		propsFn={useCallback((container) => {
// 			return [
// 				container, {
// 					contextMenuProvider,
// 					actions: options.map(({ text, value }, i) => ({
// 						id: i + '',
// 						label: text,
// 						tooltip: text,
// 						class: undefined,
// 						enabled: true,
// 						run: () => {
// 							onChangeSelection(value);
// 						},
// 					}))

// 				}] as const;
// 		}, [options, initVal, contextViewProvider])}

// 		dispose={useCallback((instance: DropdownMenu) => {
// 			instance.dispose();
// 			// instance.element.remove()
// 		}, [])}

// 		onCreateInstance={useCallback((instance: DropdownMenu) => {
// 			return []
// 		}, [])}

// 	/>;
// };




// export const VoidCheckBox = ({ onChangeChecked, initVal, label, checkboxRef, }: {
// 	onChangeChecked: (checked: boolean) => void;
// 	initVal: boolean;
// 	checkboxRef: React.MutableRefObject<ObjectSettingCheckboxWidget | null>;
// 	label: string;
// }) => {
// 	const containerRef = useRef<HTMLDivElement>(null);


// 	useEffect(() => {
// 		if (!containerRef.current) return;

// 		// Create and mount the Checkbox using VSCode's implementation

// 		checkboxRef.current = new ObjectSettingCheckboxWidget(
// 			containerRef.current,
// 			themeService,
// 			contextViewService,
// 			hoverService,
// 		);


// 		checkboxRef.current.setValue([{
// 			key: { type: 'string', data: label },
// 			value: { type: 'boolean', data: initVal },
// 			removable: false,
// 			resetable: true,
// 		}])

// 		checkboxRef.current.onDidChangeList((list) => {
// 			onChangeChecked(!!list);
// 		})


// 		// cleanup
// 		return () => {
// 			if (checkboxRef.current) {
// 				checkboxRef.current.dispose();
// 				if (containerRef.current) {
// 					while (containerRef.current.firstChild) {
// 						containerRef.current.removeChild(containerRef.current.firstChild);
// 					}
// 				}
// 				checkboxRef.current = null;
// 			}
// 		};
// 	}, [checkboxRef, label, initVal, onChangeChecked]);

// 	return <div ref={containerRef} className="w-full" />;
// };


