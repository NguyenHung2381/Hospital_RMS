const Svg = (p: React.SVGProps<SVGSVGElement>) => (
	<svg
		viewBox='0 0 24 24'
		fill='none'
		stroke='currentColor'
		strokeWidth={2}
		strokeLinecap='round'
		strokeLinejoin='round'
		{...p}
	/>
);

export const ChevLeft = () => (
	<Svg>
		<polyline points='15 18 9 12 15 6' />
	</Svg>
);

export const UploadIcon = () => (
	<Svg>
		<polyline points='16 16 12 12 8 16' />
		<line
			x1='12'
			y1='12'
			x2='12'
			y2='21'
		/>
		<path d='M20.39 18.39A5 5 0 0 0 18 9h-1.26A8 8 0 1 0 3 16.3' />
	</Svg>
);

export const DownloadIcon = () => (
	<Svg>
		<polyline points='8 17 12 21 16 17' />
		<line
			x1='12'
			y1='12'
			x2='12'
			y2='21'
		/>
		<path d='M20.88 18.09A5 5 0 0 0 18 9h-1.26A8 8 0 1 0 3 16.29' />
	</Svg>
);

export const TrashIcon = () => (
	<Svg>
		<polyline points='3 6 5 6 21 6' />
		<path d='M19 6l-1 14H6L5 6' />
		<path d='M10 11v6M14 11v6' />
		<path d='M9 6V4h6v2' />
	</Svg>
);

export const XIcon = () => (
	<Svg>
		<line
			x1='18'
			y1='6'
			x2='6'
			y2='18'
		/>
		<line
			x1='6'
			y1='6'
			x2='18'
			y2='18'
		/>
	</Svg>
);
