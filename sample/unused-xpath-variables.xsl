<?xml version="1.0" encoding="UTF-8"?>
<xsl:stylesheet xmlns:xsl="http://www.w3.org/1999/XSL/Transform"
                xmlns:xs="http://www.w3.org/2001/XMLSchema"
                exclude-result-prefixes="#all"
                expand-text="yes"
                version="3.0">
    
    <xsl:output method="xml" indent="yes"/>  
    <xsl:mode on-no-match="shallow-copy"/>
    
    <xsl:param name="varP" as="xs:integer" select="25 + 8"/>   
    
    
    <xsl:variable name="var1" as="xs:integer" select="25 + 8"/>   
    <xsl:variable name="var2" as="xs:integer" select="$var1 + 9"/>
    
    <xsl:template match="book" mode="#all">
        <xsl:variable name="var2" as="xs:integer"
            select="(let $var2 := 25, $var3 return $var3, $var2, (let $var2 := 28 return $var2)), $var2"/>
        <xsl:copy>
            <xsl:apply-templates select="$var2" mode="#current"/>
            this {$var1} is going ok {$var1}
        </xsl:copy>
    </xsl:template>
    
</xsl:stylesheet>
