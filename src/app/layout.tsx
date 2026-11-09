import type { Metadata } from "next";
import { Geist, Playfair_Display } from "next/font/google";
import Script from "next/script";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const serif = Playfair_Display({ variable: "--font-serif-display", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Business Center Esperança",
  description: "Gestão integrada do centro empresarial",
};

// Extensões do browser (antivírus, tradutores…) acrescentam atributos próprios (bis_skin_checked, bis_register,
// __processed_…) ao HTML antes de o React hidratar, o que gera o aviso "A tree hydrated but some attributes…".
// Este pequeno script remove esses atributos à medida que aparecem e para de observar passados 5 s (a hidratação
// já terminou). Não toca em atributos da aplicação.
const stripExtensionAttrs = `(function(){
  var re=/^(bis_|__processed_)/;
  function clean(el){var a=el.attributes;if(!a)return;for(var i=a.length-1;i>=0;i--){if(re.test(a[i].name))el.removeAttribute(a[i].name);}}
  function all(root){clean(root);var n=root.querySelectorAll?root.querySelectorAll("*"):[];for(var i=0;i<n.length;i++)clean(n[i]);}
  try{
    var mo=new MutationObserver(function(ms){for(var i=0;i<ms.length;i++){var m=ms[i];
      if(m.type==="attributes"){if(re.test(m.attributeName||""))m.target.removeAttribute(m.attributeName);}
      else for(var j=0;j<m.addedNodes.length;j++){var n=m.addedNodes[j];if(n.nodeType===1)all(n);}}});
    mo.observe(document.documentElement,{attributes:true,subtree:true,childList:true});
    all(document.documentElement);
    setTimeout(function(){mo.disconnect();},5000);
  }catch(e){}
})();`;

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="pt" suppressHydrationWarning className={`${geistSans.variable} ${serif.variable} h-full antialiased`}>
      <body className="min-h-full" suppressHydrationWarning>
        <Script id="strip-extension-attrs" strategy="beforeInteractive">{stripExtensionAttrs}</Script>
        {children}
      </body>
    </html>
  );
}
