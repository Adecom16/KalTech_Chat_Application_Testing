export default function Logo({ size = 48, className = '' }) {
  return (
    <svg 
      width={size} 
      height={size} 
      viewBox="0 0 100 100" 
      className={className}
      fill="none" 
      xmlns="http://www.w3.org/2000/svg"
    >
      {/* Outer circle */}
      <circle cx="50" cy="50" r="45" stroke="#DAA520" strokeWidth="3" fill="none" />
      
      {/* Chat bubble 1 */}
      <path 
        d="M25 35 L25 55 L30 55 L35 62 L35 55 L55 55 L55 35 Z" 
        fill="#DAA520"
      />
      
      {/* Chat bubble 2 */}
      <path 
        d="M45 45 L45 65 L65 65 L65 72 L70 65 L75 65 L75 45 Z" 
        fill="white"
      />
      
      {/* K letter */}
      <text 
        x="50" 
        y="58" 
        textAnchor="middle" 
        fill="#DAA520" 
        fontSize="20" 
        fontWeight="bold" 
        fontFamily="Arial, sans-serif"
      >
        K
      </text>
    </svg>
  )
}
