import Link from "next/link"
import { BarChart3 } from "lucide-react"

export function Footer() {
    return (
        <footer className="border-t bg-background">
            <div className="container mx-auto px-4 py-8">
                <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
                    <div className="space-y-3">
                        <div className="flex items-center gap-2">
                            <div className="w-6 h-6 bg-primary rounded-md flex items-center justify-center">
                                <BarChart3 className="w-4 h-4 text-primary-foreground" />
                            </div>
                            <span className="font-bold">Saathi</span>
                        </div>
                        <p className="text-sm text-muted-foreground">
                            Collaborative task management made simple and efficient.
                        </p>
                    </div>

                    <div>
                        <h3 className="font-semibold mb-3">Product</h3>
                        <ul className="space-y-2 text-sm">
                            <li>
                                <Link href="/tasks" className="text-muted-foreground hover:text-foreground">
                                    Tasks
                                </Link>
                            </li>
                            <li>
                                <Link href="/dashboard" className="text-muted-foreground hover:text-foreground">
                                    Dashboard
                                </Link>
                            </li>
                            <li>
                                <Link href="/features" className="text-muted-foreground hover:text-foreground">
                                    Features
                                </Link>
                            </li>
                        </ul>
                    </div>

                    <div>
                        <h3 className="font-semibold mb-3">Support</h3>
                        <ul className="space-y-2 text-sm">
                            <li>
                                <Link href="/help" className="text-muted-foreground hover:text-foreground">
                                    Help Center
                                </Link>
                            </li>
                            <li>
                                <Link href="/contact" className="text-muted-foreground hover:text-foreground">
                                    Contact Us
                                </Link>
                            </li>
                            <li>
                                <Link href="/docs" className="text-muted-foreground hover:text-foreground">
                                    Documentation
                                </Link>
                            </li>
                        </ul>
                    </div>

                    <div>
                        <h3 className="font-semibold mb-3">Legal</h3>
                        <ul className="space-y-2 text-sm">
                            <li>
                                <Link href="/privacy" className="text-muted-foreground hover:text-foreground">
                                    Privacy Policy
                                </Link>
                            </li>
                            <li>
                                <Link href="/terms" className="text-muted-foreground hover:text-foreground">
                                    Terms of Service
                                </Link>
                            </li>
                        </ul>
                    </div>
                </div>

                <div className="border-t mt-8 pt-8 text-center text-sm text-muted-foreground">
                    <p>&copy; 2024 Saathi. All rights reserved.</p>
                </div>
            </div>
        </footer>
    )
}